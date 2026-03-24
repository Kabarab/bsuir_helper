import asyncio
import time
from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from database.core import engine, Base, get_db
from database.models import User, Task, CustomEvent, AttendanceRecord
from bot.bot import bot, dp, setup_menu_button
from services.calculator import calculate_ip
from services.bsuir_api import (
    fetch_schedule, get_mock_grades, fetch_current_week,
    fetch_all_employees, fetch_employee_schedule,
    fetch_student_groups, fetch_faculties, fetch_specialities,
    fetch_group_rating, get_group_info
)
from services.rating import rating_service
from services.notifications import notification_service
from services.rating_update import rating_update_service

import uvicorn
import time
import os
from datetime import datetime as dt_datetime
from zoneinfo import ZoneInfo
from services.time_machine import time_machine

MINSK_TZ = ZoneInfo("Europe/Minsk")

app = FastAPI(title="BSUIR Nexus API")

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        print(f"ERROR: {request.method} {request.url.path} | Unhandled Exception:\n{error_traceback}", flush=True)
        # Ensure error still returned as JSON to client
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=500,
            content={"detail": f"SERVER ERROR:\n{error_traceback}"},
            headers={"Access-Control-Allow-Origin": "*" }
        )
    
    duration = time.time() - start_time
    print(f"DEBUG: {request.method} {request.url.path} | Status: {response.status_code} | Duration: {duration:.3f}s", flush=True)
    return response

# --- Routes - Basics ---
@app.get("/health")
async def health():
    return {"status": "ok", "port": os.getenv("PORT", "not set")}

@app.get("/api/time")
async def server_time():
    now = time_machine.now(MINSK_TZ)
    return {"iso": now.isoformat(), "timestamp": now.timestamp()}

@app.post("/api/debug/time")
async def set_debug_time(data: dict):
    # Expects {"iso": "2026-03-17T10:00:00"} or {"iso": null} to reset
    iso_str = data.get("iso")
    time_machine.set_time(iso_str)
    now = time_machine.now(MINSK_TZ)
    return {"status": "ok", "new_time": now.isoformat()}

@app.post("/api/debug/check_notifications")
async def trigger_notifications():
    stats = await notification_service.check_notifications(dry_run=True)
    return {"status": "ok", "stats": stats}

@app.post("/api/debug/test_setup")
async def setup_test_data(data: dict, db: AsyncSession = Depends(get_db)):
    tg_id = data.get("telegram_id", 89902748)
    user_result = await db.execute(select(User).where(User.telegram_id == tg_id))
    user = user_result.scalars().first()
    if not user:
        user = User(telegram_id=tg_id, bsuir_group="453501")
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    # Optional: Clear tasks
    if data.get("clear_tasks"):
        from sqlalchemy import text
        await db.execute(text("DELETE FROM tasks WHERE user_id = :uid"), {"uid": user.id})
        await db.commit()
    
    return {"status": "ok", "user_id": user.id}

# --- In-memory grades cache ---
_grades_cache = {}
GRADES_CACHE_TTL = 600  # 10 minutes

WEBHOOK_PATH = "/api/bot/webhook"
WEBHOOK_URL = os.getenv("BACKEND_URL", "") + WEBHOOK_PATH

@app.on_event("startup")

async def startup_event():
    print(f"STARTUP: PORT env = {os.getenv('PORT', 'NOT SET')}", flush=True)
    print("STARTUP: Starting application initialization...", flush=True)
    # Инициализация таблиц
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Add columns dynamically for existing DBs (compatible with both SQLite and PostgreSQL)
        from sqlalchemy import text, inspect as sa_inspect
        
        # Helper to safely add a column if it doesn't exist
        async def safe_add_column(table, column, col_type, default=None):
            try:
                def check_column(sync_conn):
                    insp = sa_inspect(sync_conn)
                    columns = [c['name'] for c in insp.get_columns(table)]
                    return column in columns
                
                exists = await conn.run_sync(check_column)
                if not exists:
                    default_clause = f" DEFAULT {default}" if default is not None else ""
                    await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}{default_clause};"))
                    print(f"Added column {table}.{column}", flush=True)
            except Exception as e:
                print(f"Schema update notice ({table}.{column}): {e}", flush=True)
        
        await safe_add_column("custom_events", "is_recurring", "BOOLEAN", "false")
        await safe_add_column("custom_events", "recurrence_type", "VARCHAR", None)
        await safe_add_column("custom_events", "recurrence_end_date", "VARCHAR", None)
        await safe_add_column("custom_events", "recurrence_interval", "INTEGER", "1")
        await safe_add_column("tasks", "reminders", "VARCHAR", None)
        await safe_add_column("tasks", "due_time", "VARCHAR", None)
        await safe_add_column("tasks", "overdue_notified", "BOOLEAN", "false")
        await safe_add_column("users", "is_teacher", "BOOLEAN", "false")
        await safe_add_column("users", "teacher_url_id", "VARCHAR", None)
        await safe_add_column("users", "english_teacher_id", "VARCHAR", None)
        await safe_add_column("users", "english_teacher_fio", "VARCHAR", None)
        await safe_add_column("users", "average_grade", "VARCHAR", None)
        await safe_add_column("users", "rating_position", "INTEGER", None)
        await safe_add_column("users", "grades_data", "TEXT", None)
        await safe_add_column("users", "last_rating_update", "TIMESTAMP", None)
        
        # Alter column types to BigInt for Postgres if needed
        async def alter_column_type_pgsql(table, column, new_type):
            try:
                # only Postgres actually needs this manual alteration for BIGINT
                if hasattr(engine.dialect, "name") and engine.dialect.name == "postgresql":
                    await conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {new_type};"))
                    print(f"Altered column {table}.{column} to {new_type}", flush=True)
            except Exception as e:
                print(f"Schema alter notice ({table}.{column}): {e}", flush=True)
                
        await alter_column_type_pgsql("tasks", "created_at", "BIGINT")
        await alter_column_type_pgsql("users", "telegram_id", "BIGINT")
            
    # Настройка кнопки меню (WebApp)
    await setup_menu_button()
    
    # Настройка Webhook
    if os.getenv("BACKEND_URL"):
        await bot.set_webhook(url=WEBHOOK_URL)
        print(f"Webhook set to: {WEBHOOK_URL}")
    else:
        print("WARNING: BACKEND_URL not set, skipping webhook setup")
    
    # Запуск сервиса уведомлений
    asyncio.create_task(notification_service.start())
    
    # Запуск сервиса автоматического обновления оценок
    asyncio.create_task(rating_update_service.start())

from aiogram.types import Update

@app.post(WEBHOOK_PATH)
async def bot_webhook(update: dict):
    telegram_update = Update.model_validate(update, context={"bot": bot})
    await dp.feed_update(bot, telegram_update)

from typing import Optional

# --- Schemas ---
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    subject: Optional[str] = None
    linkedEventId: Optional[str] = None
    created_at: Optional[int] = None
    reminders: Optional[str] = None  # JSON array of reminder offsets in minutes

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    is_completed: Optional[bool] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    subject: Optional[str] = None
    linkedEventId: Optional[str] = None
    reminders: Optional[str] = None

class CustomEventBase(BaseModel):
    title: str
    startTime: str
    endTime: str
    type: str = "CUSTOM"
    color: str = "blue"
    date: Optional[str] = None
    is_recurring: Optional[bool] = False
    recurrence_type: Optional[str] = None
    recurrence_end_date: Optional[str] = None
    recurrence_interval: Optional[int] = 1

class CustomEventCreate(CustomEventBase):
    pass

class TaskResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    is_completed: bool = False
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    subject: Optional[str] = None
    linkedEventId: Optional[str] = None
    created_at: Optional[int] = None
    reminders: Optional[str] = None
    overdue_notified: bool = False

    class Config:
        from_attributes = True

class CustomEventResponse(BaseModel):
    id: int
    user_id: int
    title: str
    startTime: str
    endTime: str
    type: str = "CUSTOM"
    color: str = "blue"
    date: Optional[str] = None
    is_recurring: bool = False
    recurrence_type: Optional[str] = None
    recurrence_end_date: Optional[str] = None
    recurrence_interval: int = 1

    class Config:
        from_attributes = True

class CustomEventUpdate(BaseModel):
    title: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    type: Optional[str] = None
    color: Optional[str] = None
    date: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_type: Optional[str] = None

class AttendanceBase(BaseModel):
    subject: str
    lesson_type: str
    date: str
    start_time: str
    end_time: str
    hours: int = 2

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceResponse(AttendanceBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

class IpRequest(BaseModel):
    ip: str

class UserUpdate(BaseModel):
    bsuir_group: Optional[str] = None
    bsuir_subgroup: Optional[int] = 0
    bsuir_id: Optional[str] = None
    is_teacher: Optional[bool] = False
    teacher_url_id: Optional[str] = None
    english_teacher_id: Optional[str] = None
    english_teacher_fio: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    telegram_id: int
    bsuir_group: Optional[str] = None
    bsuir_subgroup: Optional[int] = 0
    bsuir_id: Optional[str] = None
    is_teacher: Optional[bool] = False
    teacher_url_id: Optional[str] = None
    english_teacher_id: Optional[str] = None
    english_teacher_fio: Optional[str] = None


# --- Routes - Tasks ---
@app.get("/api/tasks/{telegram_id}", response_model=list[TaskResponse])
async def get_tasks(telegram_id: int, db: AsyncSession = Depends(get_db)):
    # Авторегистрация или получение пользователя
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        user = User(telegram_id=telegram_id)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    result = await db.execute(select(Task).where(Task.user_id == user.id))
    return result.scalars().all()

@app.post("/api/tasks/{telegram_id}", response_model=TaskResponse)
async def create_task(telegram_id: int, task: TaskCreate, db: AsyncSession = Depends(get_db)):
    print(f"REQUEST [POST /api/tasks/{telegram_id}]: {task.title}", flush=True)
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        print(f"Creating user for TG_ID: {telegram_id}", flush=True)
        user = User(telegram_id=telegram_id)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    print(f"Saving task for UserID: {user.id}", flush=True)
    
    new_task = Task(
        user_id=user.id, 
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date,
        due_time=task.due_time,
        subject=task.subject,
        linkedEventId=task.linkedEventId,
        reminders=task.reminders,
        created_at=task.created_at or int(time.time() * 1000),
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return new_task

@app.put("/api/tasks/{task_id}", response_model=TaskResponse)
async def update_task(task_id: int, task_update: TaskUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = task_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)
        
    await db.commit()
    await db.refresh(task)
    return task

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.delete(task)
    await db.commit()
    return {"success": True}
    
@app.put("/api/tasks/{task_id}/toggle")
async def toggle_task(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.is_completed = not task.is_completed
    await db.commit()
    return {"success": True, "is_completed": task.is_completed}

# --- Routes - Users ---
@app.get("/api/users/{telegram_id}", response_model=UserResponse)
async def get_user(telegram_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalars().first()
    if not user:
        user = User(telegram_id=telegram_id)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user

@app.put("/api/users/{telegram_id}/preferences", response_model=UserResponse)
async def update_user_preferences(telegram_id: int, user_update: UserUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalars().first()
    if not user:
        user = User(telegram_id=telegram_id)
        db.add(user)
    
    if user_update.bsuir_group is not None:
        user.bsuir_group = user_update.bsuir_group

    if user_update.bsuir_id is not None:
        user.bsuir_id = user_update.bsuir_id

    if user_update.bsuir_subgroup is not None:
        user.bsuir_subgroup = user_update.bsuir_subgroup

    if user_update.is_teacher is not None:
        user.is_teacher = user_update.is_teacher

    if user_update.teacher_url_id is not None:
        user.teacher_url_id = user_update.teacher_url_id
        
    if user_update.english_teacher_id is not None:
        user.english_teacher_id = user_update.english_teacher_id

    if user_update.english_teacher_fio is not None:
        user.english_teacher_fio = user_update.english_teacher_fio
        
    await db.commit()
    await db.refresh(user)
    return user

# --- Routes - Custom Events ---
@app.get("/api/events/{telegram_id}", response_model=list[CustomEventResponse])
async def get_events(telegram_id: int, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        return []
    result = await db.execute(select(CustomEvent).where(CustomEvent.user_id == user.id))
    return result.scalars().all()

@app.post("/api/events/{telegram_id}", response_model=CustomEventResponse)
async def create_event(telegram_id: int, event: CustomEventCreate, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        user = User(telegram_id=telegram_id)
        db.add(user)
        await db.commit()
        await db.refresh(user)
        
    new_event = CustomEvent(
        user_id=user.id,
        title=event.title,
        startTime=event.startTime,
        endTime=event.endTime,
        type=event.type,
        color=event.color,
        date=event.date,
        is_recurring=event.is_recurring,
        recurrence_type=event.recurrence_type,
        recurrence_end_date=event.recurrence_end_date,
        recurrence_interval=event.recurrence_interval
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)
    return new_event

@app.put("/api/events/{event_id}", response_model=CustomEventResponse)
async def update_event(event_id: int, event_update: CustomEventUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CustomEvent).where(CustomEvent.id == event_id))
    event = result.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    update_data = event_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)
    
    await db.commit()
    await db.refresh(event)
    return event

@app.delete("/api/events/{event_id}")
async def delete_event(event_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CustomEvent).where(CustomEvent.id == event_id))
    event = result.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.delete(event)
    await db.commit()
    return {"success": True}

# --- Routes - Attendance ---
@app.get("/api/attendance/{telegram_id}", response_model=list[AttendanceResponse])
async def get_attendance(telegram_id: int, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        return []
    result = await db.execute(select(AttendanceRecord).where(AttendanceRecord.user_id == user.id))
    return result.scalars().all()

@app.post("/api/attendance/{telegram_id}/toggle")
async def toggle_attendance(telegram_id: int, data: AttendanceCreate, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        user = User(telegram_id=telegram_id)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Check if record already exists for this lesson on this date
    existing_result = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.user_id == user.id,
            AttendanceRecord.subject == data.subject,
            AttendanceRecord.date == data.date,
            AttendanceRecord.start_time == data.start_time
        )
    )
    existing = existing_result.scalars().first()

    if existing:
        await db.delete(existing)
        await db.commit()
        return {"status": "removed", "hours": 0}
    else:
        new_record = AttendanceRecord(
            user_id=user.id,
            subject=data.subject,
            lesson_type=data.lesson_type,
            date=data.date,
            start_time=data.start_time,
            end_time=data.end_time,
            hours=data.hours
        )
        db.add(new_record)
        await db.commit()
        return {"status": "added", "hours": data.hours}

@app.get("/api/attendance/{telegram_id}/stats")
async def get_attendance_stats(telegram_id: int, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        return {"total_hours": 0, "breakdown": {}}
    
    result = await db.execute(select(AttendanceRecord).where(AttendanceRecord.user_id == user.id))
    records = result.scalars().all()
    
    total_hours = sum(r.hours for r in records)
    breakdown = {}
    for r in records:
        breakdown[r.subject] = breakdown.get(r.subject, 0) + r.hours
        
    return {
        "total_hours": total_hours,
        "breakdown": breakdown,
        "records_count": len(records)
    }

# --- Routes - BSUIR ---
@app.get("/api/bsuir/schedule/{group}")
async def schedule(group: str):
    data = await fetch_schedule(group)
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    return data

@app.get("/api/bsuir/grades/{telegram_id}")
async def grades(telegram_id: int, db: AsyncSession = Depends(get_db)):
    # Check cache first
    cache_key = f"grades:{telegram_id}"
    cached = _grades_cache.get(cache_key)
    if cached and (time.time() - cached['ts']) < GRADES_CACHE_TTL:
        return cached['data']

    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalars().first()
    if not user or not user.bsuir_id or not user.bsuir_group:
        return get_mock_grades() # Fallback to mock if no ID or group
    
    user_group_info = await get_group_info(user.bsuir_group)
    if not user_group_info:
        # If user has ID but no group info found, don't show mock data
        return {"average": 0, "rating": 0, "subjects": [], "is_real": False, "error": "Group info not found"}

    sdef = user_group_info.get("specialityDepartmentEducationFormId")
    course = user_group_info.get("course")
    if not sdef or not course:
        return {"average": 0, "rating": 0, "subjects": [], "is_real": False, "error": "Incomplete group info"}

    # 2. Parallelize: rating list AND student's own marks structure
    rating_task = fetch_group_rating(sdef, course)
    marks_task = rating_service.fetch_student_rating(user.bsuir_id)
    
    rating_list, subjects_data = await asyncio.gather(rating_task, marks_task)

    if isinstance(rating_list, dict) and "error" in rating_list:
        return {"average": 0, "rating": 0, "subjects": [], "is_real": False, "error": rating_list["error"]}
    
    # 3. Find ranking
    if isinstance(rating_list, list):
        # The API usually returns them unsorted or partially sorted. Sort for accuracy.
        rating_list.sort(key=lambda x: x.get("average", 0), reverse=True)

    average = 0.0
    ranking = 0
    for idx, student in enumerate(rating_list):
        if student.get("studentCardNumber") == user.bsuir_id:
            average = student.get("average", 0.0)
            ranking = idx + 1
            break

    # 4. Process subjects
    subjects = []
    raw_data = subjects_data.get("data")
    
    # Update DB with latest data if successful
    if subjects_data.get("success"):
        try:
            import json
            user.average_grade = str(average)
            user.rating_position = ranking
            user.grades_data = json.dumps(raw_data)
            user.last_rating_update = dt_datetime.now()
            await db.commit()
            print(f"Updated stored grades for user {telegram_id}")
        except Exception as e:
            print(f"Failed to update user grades in DB: {e}")

    lessons_list = []
    if isinstance(raw_data, list):
        lessons_list = raw_data
    elif isinstance(raw_data, dict):
        lessons_list = raw_data.get("lessons", [])
        if not lessons_list and raw_data: # If it's a single object that's not a list but holds the data
            lessons_list = [raw_data]

    # If fetch failed but we have stored data, use it
    if not subjects_data.get("success") and user.grades_data:
        try:
            import json
            lessons_list = json.loads(user.grades_data)
            if not isinstance(lessons_list, list) and isinstance(lessons_list, dict):
                lessons_list = lessons_list.get("lessons", [])
            average = float(user.average_grade or 0.0)
            ranking = user.rating_position or 0
            print(f"Using stored grades for user {telegram_id}")
        except Exception as e:
            print(f"Failed to parse stored grades: {e}")

    if (subjects_data.get("success") or user.grades_data) and lessons_list:
        seen_subjects = {} # subj_name -> list of {val, date}
        for lesson in lessons_list:
            if not isinstance(lesson, dict): continue
            
            subj_name = (lesson.get("lessonNameAbbrev") or 
                         lesson.get("subject") or 
                         lesson.get("subjectAbbrev") or 
                         "Unknown")
            
            date_str = lesson.get("dateString")
            
            raw_marks = lesson.get("marks", [])
            if not isinstance(raw_marks, list):
                raw_marks = [raw_marks] if raw_marks is not None else []
            
            # Extract numeric marks from mark objects
            marks_with_dates = []
            for m in raw_marks:
                val = None
                if isinstance(m, dict):
                    val = m.get("mark")
                else:
                    val = m
                
                if val is not None:

                    try:
                        is_str = isinstance(val, str)
                        clean_val = val.strip() if is_str else val
                        if is_str and not clean_val.isdigit():
                            continue
                        num = int(clean_val)
                        if 0 <= num <= 10:
                            marks_with_dates.append({"val": num, "date": date_str})

                    except (ValueError, TypeError):
                        continue
            
            if subj_name and marks_with_dates:
                if subj_name not in seen_subjects:
                    seen_subjects[subj_name] = []
                seen_subjects[subj_name].extend(marks_with_dates)

        for name, marks_in_subj in seen_subjects.items():
            # Sort marks by value descending
            sorted_marks = sorted(marks_in_subj, key=lambda x: x["val"], reverse=True)
            subjects.append({
                "subject": name,
                "marks": sorted_marks
            })


    grades_data = {
        "average": average,
        "rating": ranking,
        "subjects": subjects,
        "studentId": user.bsuir_id,
        "is_real": True
    }
    # Cache the result
    _grades_cache[cache_key] = {'data': grades_data, 'ts': time.time()}
    return grades_data

@app.get("/api/bsuir/week")
async def current_week():
    data = await fetch_current_week()
    if isinstance(data, dict) and "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    
    # Provide server time to avoid client timezone desyncs
    now = time_machine.now(MINSK_TZ)
    return {
        "week": data,
        "serverTime": now.isoformat()
    }

@app.get("/api/bsuir/teachers")
async def teachers():
    data = await fetch_all_employees()
    if isinstance(data, dict) and "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    return data

@app.get("/api/bsuir/teachers/{url_id}/schedule")
async def teacher_schedule(url_id: str):
    data = await fetch_employee_schedule(url_id)
    if isinstance(data, dict) and "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    return data

@app.get("/api/bsuir/groups")
async def groups():
    data = await fetch_student_groups()
    if isinstance(data, dict) and "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    return data

@app.get("/api/bsuir/faculties")
async def faculties():
    data = await fetch_faculties()
    if isinstance(data, dict) and "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    return data

@app.get("/api/bsuir/specialities")
async def specialities():
    data = await fetch_specialities()
    if isinstance(data, dict) and "error" in data:
        raise HTTPException(status_code=400, detail=data["error"])
    return data

# --- Routes - Utilities ---
@app.post("/api/utils/ipcalc")
async def ipcalc(req: IpRequest):
    res = calculate_ip(req.ip)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res

@app.get("/api/bsuir/proxy")
async def bsuir_proxy(url: str):
    """Proxy for BSUIR API using authenticated session from RatingService."""
    try:
        session = await rating_service.get_session()
        # Prefer JSON, but accept anything. JSON is much faster to parse than XML.
        headers = {"Accept": "application/json, text/xml, */*"}
        async with session.get(url, headers=headers) as response:
            content_type = response.headers.get("Content-Type", "")
            content = await response.text()
            
            # If BSUIR returns JSON, keep it as is (application/json)
            # If it's XML, stay compatible with frontend expectation
            media_type = "application/json" if "json" in content_type.lower() else "text/xml"
            
            print(f"PROXY SUCCESS: {url} | Type: {media_type} | Length: {len(content)}")
            return Response(content=content, media_type=media_type)
    except Exception as e:
        print(f"PROXY ERROR FOR {url}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch from BSUIR: {str(e)}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

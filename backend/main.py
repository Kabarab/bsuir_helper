import asyncio
from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from database.core import engine, Base, get_db
from database.models import User, Task, CustomEvent
from bot.bot import bot, dp, setup_menu_button
from services.calculator import calculate_ip
from services.bsuir_api import (
    fetch_schedule, get_mock_grades, fetch_current_week,
    fetch_all_employees, fetch_employee_schedule,
    fetch_student_groups, fetch_faculties, fetch_specialities,
    fetch_group_rating
)
from services.rating import rating_service
from services.notifications import notification_service

import uvicorn
import time
import os

app = FastAPI(title="BSUIR Nexus API")

# --- In-memory grades cache ---
_grades_cache = {}
GRADES_CACHE_TTL = 600  # 10 minutes

WEBHOOK_PATH = "/api/bot/webhook"
WEBHOOK_URL = os.getenv("BACKEND_URL", "") + WEBHOOK_PATH

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Упрощение для разработки
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    print("STARTUP: Starting application initialization...")
    # Инициализация таблиц
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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
    subject: Optional[str] = None
    linkedEventId: Optional[str] = None
    created_at: Optional[int] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    is_completed: Optional[bool] = None
    due_date: Optional[str] = None
    subject: Optional[str] = None
    linkedEventId: Optional[str] = None

class CustomEventBase(BaseModel):
    title: str
    startTime: str
    endTime: str
    type: str = "CUSTOM"
    color: str = "blue"
    date: Optional[str] = None

class CustomEventCreate(CustomEventBase):
    pass

class IpRequest(BaseModel):
    ip: str

class UserUpdate(BaseModel):
    bsuir_group: Optional[str] = None
    bsuir_subgroup: Optional[int] = 0
    bsuir_id: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    telegram_id: int
    bsuir_group: Optional[str] = None
    bsuir_subgroup: Optional[int] = 0
    bsuir_id: Optional[str] = None


# --- Routes - Tasks ---
@app.get("/api/tasks/{telegram_id}")
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

@app.post("/api/tasks/{telegram_id}")
async def create_task(telegram_id: int, task: TaskCreate, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_task = Task(
        user_id=user.id, 
        title=task.title,
        description=task.description,
        priority=task.priority,
        due_date=task.due_date,
        subject=task.subject,
        linkedEventId=task.linkedEventId,
        created_at=task.created_at
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return new_task

@app.put("/api/tasks/{task_id}")
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
        
    await db.commit()
    await db.refresh(user)
    return user

# --- Routes - Custom Events ---
@app.get("/api/events/{telegram_id}")
async def get_events(telegram_id: int, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        return []
    result = await db.execute(select(CustomEvent).where(CustomEvent.user_id == user.id))
    return result.scalars().all()

@app.post("/api/events/{telegram_id}")
async def create_event(telegram_id: int, event: CustomEventCreate, db: AsyncSession = Depends(get_db)):
    user_result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    new_event = CustomEvent(
        user_id=user.id,
        title=event.title,
        startTime=event.startTime,
        endTime=event.endTime,
        type=event.type,
        color=event.color,
        date=event.date
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)
    return new_event

@app.delete("/api/events/{event_id}")
async def delete_event(event_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CustomEvent).where(CustomEvent.id == event_id))
    event = result.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    
    await db.delete(event)
    await db.commit()
    return {"success": True}

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
    
    # 1. Get all groups to find sdef and course for the user's group
    groups_data = await fetch_student_groups()
    if isinstance(groups_data, dict) and "error" in groups_data:
        return get_mock_grades()

    user_group_info = next((g for g in groups_data if g.get("name") == user.bsuir_group), None)
    if not user_group_info:
        return get_mock_grades()

    sdef = user_group_info.get("specialityDepartmentEducationFormId")
    course = user_group_info.get("course")
    if not sdef or not course:
        return get_mock_grades()

    # 2. Fetch the rating list for this group
    rating_list = await fetch_group_rating(sdef, course)
    if isinstance(rating_list, dict) and "error" in rating_list:
        return get_mock_grades()
    
    # rating_list should be a list of dicts. Sort by average descending.
    if isinstance(rating_list, list):
        rating_list.sort(key=lambda x: x.get("average", 0), reverse=True)

    # 3. Find the user's average and ranking
    average = 0.0
    ranking = 0
    for idx, student in enumerate(rating_list):
        if student.get("studentCardNumber") == user.bsuir_id:
            average = student.get("average", 0.0)
            ranking = idx + 1
            break

    # 4. Fetch the subjects and marks for the user
    subjects_data = await rating_service.fetch_student_rating(user.bsuir_id)
    subjects = []
    
    if subjects_data.get("success") and isinstance(subjects_data.get("data"), list):
        seen_subjects = set()
        for lesson in subjects_data["data"]:
            subj_name = lesson.get("lessonNameAbbrev")
            marks_list = lesson.get("marks", [])
            
            if subj_name and marks_list and subj_name not in seen_subjects:
                best_mark = max([m.get("mark", 0) for m in marks_list] + [0])
                if best_mark > 0:
                    subjects.append({
                        "name": subj_name,
                        "mark": best_mark
                    })
                    seen_subjects.add(subj_name)

    grades_data = {
        "average": average,
        "rating": ranking,
        "subjects": subjects,
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
    return data

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
        async with session.get(url, headers={"Accept": "application/xml"}) as response:
            # text() automatically handles decompression and decoding
            content = await response.text()
            print(f"PROXY SUCCESS: {url} | Content length: {len(content)}")
            print(f"CONTENT SNIPPET: {content[:500]}")
            # Force text/xml to help frontend parsers, even if BSUIR says application/json
            return Response(content=content, media_type="text/xml")
    except Exception as e:
        print(f"PROXY ERROR FOR {url}: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch from BSUIR: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

MINSK_TZ = ZoneInfo("Europe/Minsk")
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from database.core import SessionLocal
from database.models import User, Task
from bot.bot import bot
from services.bsuir_api import fetch_schedule, fetch_current_week
from services.time_machine import time_machine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.notified_pairs = set() # (user_id, date, start_time) to avoid double notifications

    async def start(self):
        logger.info("Notification service started")
        while True:
            try:
                await self.check_notifications()
            except Exception as e:
                logger.error(f"Error in notification check: {e}")
            await asyncio.sleep(60) # Check every minute

    async def check_notifications(self):
        async with SessionLocal() as db:
            result = await db.execute(select(User))
            users = result.scalars().all()
            
            current_week = await fetch_current_week()
            if isinstance(current_week, dict) and "error" in current_week:
                current_week = None

            for user in users:
                await self.process_user_tasks(db, user)
                if user.bsuir_group and current_week:
                    await self.process_user_schedule(user, current_week)
            
            await db.commit()

    async def process_user_tasks(self, db: AsyncSession, user: User):
        import json
        now = time_machine.now(MINSK_TZ).replace(tzinfo=None)
        
        # Find all incomplete tasks for the user instead of querying by threshold in DB
        result = await db.execute(
            select(Task).where(
                Task.user_id == user.id,
                Task.is_completed == False
            )
        )
        tasks = result.scalars().all()
        
        for task in tasks:
            target_dt = None
            
            # Try parsing from linkedEventId: "2026-03-06_09:00_Maths"
            if task.linkedEventId:
                parts = task.linkedEventId.split('_')
                if len(parts) >= 2:
                    try:
                        date_str = parts[0]
                        time_str = parts[1]
                        target_dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
                    except ValueError:
                        pass
            
            # Fallback to due_date + end of day
            if not target_dt and task.due_date:
                try:
                    target_dt = datetime.strptime(task.due_date, "%Y-%m-%d").replace(hour=23, minute=59)
                except ValueError:
                    pass
            
            if not target_dt:
                continue
                
            # If the task is already past the target_dt, don't remind of start, but notify if overdue
            if now > target_dt:
                if not task.overdue_notified:
                    msg = (
                        f"⚠️ <b>Задача просрочена!</b>\n\n"
                        f"📌 {task.title}"
                    )
                    if task.subject:
                        msg += f"\n📚 Предмет: {task.subject}"
                    
                    try:
                        await bot.send_message(user.telegram_id, msg)
                        task.overdue_notified = True
                    except Exception as e:
                        logger.error(f"Failed to send overdue notification to {user.telegram_id}: {e}")
                continue

            # Parse reminders array [15, 60] etc. or fallback to user.notification_offset
            reminders_to_check = []
            if task.reminders:
                try:
                    reminders_to_check = json.loads(task.reminders)
                except Exception:
                    pass
            if not reminders_to_check:
                reminders_to_check = [user.notification_offset]
                
            # Sort reminders descending (e.g., 1440, 60, 5) to trigger the largest first
            for offset_mins in sorted(reminders_to_check, reverse=True):
                notify_time = target_dt - timedelta(minutes=offset_mins)
                
                if now >= notify_time:
                    # check if we already reminded for this specific offset or a closer one
                    if task.last_reminded_at and task.last_reminded_at >= notify_time:
                        continue
                        
                    time_left = int((target_dt - now).total_seconds() / 60)
                    msg = (
                        f"🔔 <b>Напоминание о задаче!</b>\n\n"
                        f"📌 {task.title}\n"
                        f"⏰ Начнется через {time_left} мин. ({target_dt.strftime('%H:%M')})"
                    )
                    if task.subject:
                        msg += f"\n📚 Предмет: {task.subject}"
                    
                    try:
                        await bot.send_message(user.telegram_id, msg)
                        task.last_reminded_at = now
                        # We break because we just sent a notification
                        break
                    except Exception as e:
                        logger.error(f"Failed to send task notification to {user.telegram_id}: {e}")

    async def process_user_schedule(self, user: User, current_week: int):
        now = time_machine.now(MINSK_TZ).replace(tzinfo=None)
        weekday_map = {0: "Понедельник", 1: "Вторник", 2: "Среда", 3: "Четверг", 4: "Пятница", 5: "Суббота", 6: "Воскресенье"}
        today_name = weekday_map[now.weekday()]
        
        schedule_data = await fetch_schedule(user.bsuir_group)
        if not schedule_data or "error" in schedule_data or "schedules" not in schedule_data:
            return

        today_schedule = schedule_data["schedules"].get(today_name, [])
        valid_pairs = []
        for pair in today_schedule:
            # Check if pair is for current week
            if current_week not in pair.get("weekNumber", []):
                continue
            
            # Subgroup filtering
            pair_subgroup = pair.get("numSubgroup", 0)
            if pair_subgroup != 0 and user.bsuir_subgroup != 0 and pair_subgroup != user.bsuir_subgroup:
                continue

            start_time_str = pair.get("startLessonTime")
            if not start_time_str:
                continue
            
            try:
                pair_time = datetime.strptime(start_time_str, "%H:%M").replace(
                    year=now.year, month=now.month, day=now.day
                )
                valid_pairs.append((pair_time, pair))
            except ValueError:
                continue

        if not valid_pairs:
            return

        # Sort by time to find the first pair
        valid_pairs.sort(key=lambda x: x[0])
        first_pair_time, first_pair = valid_pairs[0]

        for pair_time, pair in valid_pairs:
            start_time_str = pair.get("startLessonTime")
            time_diff = (pair_time - now).total_seconds() / 60
            
            # 1. Check for the "First Lesson" 1-hour reminder
            if pair == first_pair and 59 <= time_diff <= 61:
                notif_key = (user.id, now.date().isoformat(), start_time_str, "1h_reminder")
                if notif_key not in self.notified_pairs:
                    subject = pair.get("subject", "Пара")
                    lesson_type = pair.get("lessonTypeAbbrev", "")
                    auditory = ", ".join(pair.get("auditories", []))
                    
                    msg = (
                        f"⏰ <b>Первая пара через час!</b>\n\n"
                        f"📖 {subject} ({lesson_type})\n"
                        f"⏰ Начнется в {start_time_str}\n"
                        f"📍 {auditory}"
                    )
                    
                    try:
                        await bot.send_message(user.telegram_id, msg)
                        self.notified_pairs.add(notif_key)
                        logger.info(f"Sent 1h reminder to {user.telegram_id} for {subject}")
                    except Exception as e:
                        logger.error(f"Failed to send 1h reminder to {user.telegram_id}: {e}")

            # 2. Regular notification based on user.notification_offset
            if 0 <= time_diff <= user.notification_offset:
                notif_key = (user.id, now.date().isoformat(), start_time_str, "regular")
                if notif_key not in self.notified_pairs:
                    subject = pair.get("subject", "Пара")
                    lesson_type = pair.get("lessonTypeAbbrev", "")
                    auditory = ", ".join(pair.get("auditories", []))
                    
                    msg = (
                        f"🎓 <b>Скоро пара!</b>\n\n"
                        f"📖 {subject} ({lesson_type})\n"
                        f"⏰ Через {int(time_diff)} мин. ({start_time_str})\n"
                        f"📍 {auditory}"
                    )
                    
                    try:
                        await bot.send_message(user.telegram_id, msg)
                        self.notified_pairs.add(notif_key)
                    except Exception as e:
                        logger.error(f"Failed to send schedule notification to {user.telegram_id}: {e}")

            # Cleanup old notified pairs occasionally
            if len(self.notified_pairs) > 5000:
                self.notified_pairs = {k for k in self.notified_pairs if k[1] == now.date().isoformat()}

notification_service = NotificationService()

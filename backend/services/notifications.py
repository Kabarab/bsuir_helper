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
        now = datetime.now(MINSK_TZ)
        threshold = now + timedelta(minutes=user.notification_offset)
        
        # Find tasks that are due soon, not completed, and haven't been notified yet
        result = await db.execute(
            select(Task).where(
                Task.user_id == user.id,
                Task.is_completed == False,
                Task.due_date <= threshold,
                Task.due_date > now,
                Task.last_reminded_at == None
            )
        )
        tasks = result.scalars().all()
        
        for task in tasks:
            time_left = int((task.due_date - now).total_seconds() / 60)
            msg = (
                f"🔔 <b>Напоминание о задаче!</b>\n\n"
                f"📌 {task.title}\n"
                f"⏰ Начнется через {time_left} мин. ({task.due_date.strftime('%H:%M')})"
            )
            if task.subject:
                msg += f"\n📚 Предмет: {task.subject}"
            
            try:
                await bot.send_message(user.telegram_id, msg)
                task.last_reminded_at = now
            except Exception as e:
                logger.error(f"Failed to send task notification to {user.telegram_id}: {e}")

    async def process_user_schedule(self, user: User, current_week: int):
        now = datetime.now(MINSK_TZ)
        weekday_map = {0: "Понедельник", 1: "Вторник", 2: "Среда", 3: "Четверг", 4: "Пятница", 5: "Суббота", 6: "Воскресенье"}
        today_name = weekday_map[now.weekday()]
        
        schedule_data = await fetch_schedule(user.bsuir_group)
        if "error" in schedule_data or "schedules" not in schedule_data:
            return

        today_schedule = schedule_data["schedules"].get(today_name, [])
        for pair in today_schedule:
            # Check if pair is for current week
            if current_week not in pair.get("weekNumber", []):
                continue
            
            start_time_str = pair.get("startLessonTime")
            if not start_time_str:
                continue
                
            pair_time = datetime.strptime(start_time_str, "%H:%M").replace(
                year=now.year, month=now.month, day=now.day
            )
            
            # If pair already passed today
            if pair_time < now:
                continue
                
            time_diff = (pair_time - now).total_seconds() / 60
            
            # Check if it's time to notify
            if 0 <= time_diff <= user.notification_offset:
                notif_key = (user.id, now.date().isoformat(), start_time_str)
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
                        # Cleanup old notified pairs occasionally
                        if len(self.notified_pairs) > 1000:
                            self.notified_pairs = {k for k in self.notified_pairs if k[1] == now.date().isoformat()}
                    except Exception as e:
                        logger.error(f"Failed to send schedule notification to {user.telegram_id}: {e}")

notification_service = NotificationService()

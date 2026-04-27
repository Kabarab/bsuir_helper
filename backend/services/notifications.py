import asyncio
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


class NotificationService:
    def __init__(self):
        self.notified_pairs = set() # (user_id, date, start_time) to avoid double notifications

    async def start(self):
        while True:
            try:
                await self.check_notifications()
            except Exception as e:
                pass
            await asyncio.sleep(60) # Check every minute

    async def check_notifications(self, dry_run=False):
        stats = {"users_processed": 0, "tasks_processed": 0, "notifications_sent": 0, "errors": [], "messages": []}
        async with SessionLocal() as db:
            result = await db.execute(select(User))
            users = result.scalars().all()
            
            current_week = await fetch_current_week()
            if isinstance(current_week, dict) and "error" in current_week:
                current_week = None

            for user in users:
                stats["users_processed"] += 1
                user_stats = await self.process_user_tasks(db, user, dry_run=dry_run)
                stats["tasks_processed"] += user_stats["tasks_checked"]
                stats["notifications_sent"] += user_stats["sent"]
                stats["errors"].extend(user_stats["errors"])
                stats["messages"].extend(user_stats.get("messages", []))
                
                if user.bsuir_group and current_week:
                    schedule_res = await self.process_user_schedule(user, current_week, dry_run=dry_run)
                    if isinstance(schedule_res, dict):
                        stats["errors"].extend(schedule_res.get("errors", []))
                        stats["messages"].extend(schedule_res.get("messages", []))
                        stats["notifications_sent"] += schedule_res.get("sent", 0)
            
            await db.commit()
        return stats

    async def process_user_tasks(self, db: AsyncSession, user: User, dry_run=False):
        stats = {"tasks_checked": 0, "sent": 0, "errors": [], "messages": []}
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
            stats["tasks_checked"] += 1
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
            
            # Fallback to due_date + due_time (or end of day)
            if not target_dt and task.due_date:
                try:
                    if task.due_time:
                        target_dt = datetime.strptime(f"{task.due_date} {task.due_time}", "%Y-%m-%d %H:%M")
                    else:
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
                        if dry_run:
                            stats["messages"].append(f"DRY_RUN to {user.telegram_id}: {msg}")
                        else:
                            await bot.send_message(user.telegram_id, msg)
                        task.overdue_notified = True
                        stats["sent"] += 1
                    except Exception as e:
                        stats["errors"].append(str(e))
                continue

            # Parse reminders array [15, "2026-03-23T15:00:00"] etc.
            reminders_to_check = []
            if task.reminders:
                try:
                    reminders_to_check = json.loads(task.reminders)
                except Exception:
                    pass
            
            # Ensure we always have at least the user's default offset if no custom reminders
            if not reminders_to_check:
                reminders_to_check = [user.notification_offset]
                
            for reminder_val in reminders_to_check:
                notify_time = None
                label = "Дедлайн"
                
                if isinstance(reminder_val, (int, float)):
                    # Relative reminder (minutes before target_dt)
                    notify_time = target_dt - timedelta(minutes=int(reminder_val))
                    label = f"Дедлайн через {int(reminder_val)} мин."
                elif isinstance(reminder_val, str):
                    # Absolute reminder (ISO format)
                    try:
                        notify_time = datetime.fromisoformat(reminder_val)
                        label = f"Напоминание (запланировано на {notify_time.strftime('%H:%M')})"
                    except ValueError:
                        continue
                
                if not notify_time:
                    continue
                    
                # Check if it's time to notify AND we haven't notified for this specific reminder yet
                # We use last_reminded_at as a simple gate for relative reminders,
                # but for multiple/absolute we might need a more complex state if they are very close.
                # However, usually they are distinct enough.
                if now >= notify_time:
                    # To avoid double-notifying the same reminder, we check if last_reminded_at 
                    # is VERY close to notify_time (within 1 minute) or later.
                    if task.last_reminded_at and task.last_reminded_at >= notify_time:
                        continue
                        
                    time_left = int((target_dt - now).total_seconds() / 60)
                    time_str = target_dt.strftime('%H:%M')
                    
                    if isinstance(reminder_val, (int, float)):
                        msg_time = f"⏰ {label} ({time_str})"
                    else:
                        # For absolute time, we show how much time is left until deadline
                        msg_time = f"⏰ {label}\n⌛️ До дедлайна осталось {time_left} мин. ({time_str})"
                        
                    msg = (
                        f"🔔 <b>Напоминание о задаче!</b>\n\n"
                        f"📌 {task.title}\n"
                        f"{msg_time}"
                    )
                    
                    if task.subject:
                        msg += f"\n📚 Предмет: {task.subject}"
                    
                    try:
                        if dry_run:
                            stats["messages"].append(f"DRY_RUN to {user.telegram_id}: {msg}")
                        else:
                            await bot.send_message(user.telegram_id, msg)
                        
                        task.last_reminded_at = now
                        stats["sent"] += 1
                        # Break inner loop to avoid sending multiple reminders for the same task in one check
                        # (they will trigger sequentially in next checks if needed)
                        break
                    except Exception as e:
                        stats["errors"].append(str(e))
        return stats

    async def process_user_schedule(self, user: User, current_week: int, dry_run=False):
        res = {"errors": [], "messages": [], "sent": 0}
        now = time_machine.now(MINSK_TZ).replace(tzinfo=None)
        weekday_map = {0: "Понедельник", 1: "Вторник", 2: "Среда", 3: "Четверг", 4: "Пятница", 5: "Суббота", 6: "Воскресенье"}
        today_name = weekday_map[now.weekday()]
        
        schedule_data = await fetch_schedule(user.bsuir_group)
        if not schedule_data or "error" in schedule_data or "schedules" not in schedule_data:
            return res

        today_schedule = schedule_data["schedules"].get(today_name, [])
        valid_pairs = []
        for pair in today_schedule:
            # Check if pair is for current week
            week_numbers = pair.get("weekNumber") or []
            if current_week not in week_numbers:
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
            return res

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
                        if dry_run:
                            res["messages"].append(f"DRY_RUN to {user.telegram_id}: {msg}")
                        else:
                            await bot.send_message(user.telegram_id, msg)
                        self.notified_pairs.add(notif_key)
                        res["sent"] += 1
                    except Exception as e:
                        res["errors"].append(str(e))

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
                        if dry_run:
                            res["messages"].append(f"DRY_RUN to {user.telegram_id}: {msg}")
                        else:
                            await bot.send_message(user.telegram_id, msg)
                        self.notified_pairs.add(notif_key)
                        res["sent"] += 1
                    except Exception as e:
                        res["errors"].append(str(e))
        
        # Cleanup old notified pairs occasionally
        if len(self.notified_pairs) > 5000:
            self.notified_pairs = {k for k in self.notified_pairs if k[1] == now.date().isoformat()}
            
        return res

notification_service = NotificationService()

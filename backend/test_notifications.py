
import asyncio
import os
import sys
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database.core import SessionLocal, engine
from database.models import User, Task
from services.notifications import notification_service
from services.time_machine import time_machine
from bot.bot import bot
from unittest.mock import AsyncMock

MINSK_TZ = ZoneInfo("Europe/Minsk")

async def test_notifications():
    print("--- Starting Notification Test ---")
    
    # Mock bot.send_message
    original_send_message = bot.send_message
    bot.send_message = AsyncMock()
    
    async with SessionLocal() as db:
        # 1. Get or create test user
        # We use the existing user from the DB or create a new one if missing
        from sqlalchemy.future import select
        result = await db.execute(select(User).where(User.telegram_id == 89902748))
        user = result.scalars().first()
        if not user:
            user = User(telegram_id=89902748, bsuir_group="453501")
            db.add(user)
            await db.commit()
            await db.refresh(user)
        
        # 2. Add some test tasks
        # Task 1: Linked to a class today in the future
        # Task 2: Linked to a class today in the past (overdue)
        # Task 3: Independent task with reminders
        
        # Cleanup old test tasks if any
        await db.execute(text("DELETE FROM tasks WHERE user_id = :uid"), {"uid": user.id})
        await db.commit()
        
        base_time = datetime(2026, 3, 23, 12, 0, 0)
        time_machine.set_time(base_time.isoformat())
        print(f"Set time machine to: {base_time}")
        
        # Task 1: Upcoming in 30 mins
        task1 = Task(
            user_id=user.id,
            title="Upcoming linked task",
            linkedEventId="2026-03-23_12:30_Math",
            subject="Math",
            reminders=json.dumps([15, 60]), # 15 mins before and 60 mins before
            is_completed=False
        )
        
        # Task 2: Overdue (was at 11:30)
        task2 = Task(
            user_id=user.id,
            title="Overdue task",
            due_date="2026-03-23",
            due_time="11:30",
            subject="OS",
            is_completed=False,
            overdue_notified=False
        )
        
        # Task 3: Independent upcoming
        task3 = Task(
            user_id=user.id,
            title="Fixed reminder task",
            due_date="2026-03-23",
            due_time="13:00",
            reminders=json.dumps([60]),
            is_completed=False
        )
        
        db.add_all([task1, task2, task3])
        await db.commit()
        
        # --- PHASE 1: Initial check at 12:00 ---
        # Task 1 (12:30): 60 min reminder should trigger (12:30 - 60 = 11:30 < 12:00)
        # Task 2 (11:30): Overdue should trigger
        # Task 3 (13:00): 60 min reminder should trigger (13:00 - 60 = 12:00)
        
        print("\nPhase 1: Running check at 12:00")
        await notification_service.check_notifications()
        
        for call in bot.send_message.call_args_list:
            print(f"BOT SENT: {call[0][1]}")
        
        bot.send_message.reset_mock()
        
        # --- PHASE 2: Move to 12:16 ---
        # Task 1 (12:30): 15 min reminder should trigger (12:30 - 15 = 12:15 < 12:16)
        print("\nPhase 2: Moving to 12:16")
        time_machine.set_time("2026-03-23T12:16:00")
        await notification_service.check_notifications()
        
        for call in bot.send_message.call_args_list:
            print(f"BOT SENT: {call[0][1]}")
            
        # Restore original
        bot.send_message = original_send_message
        
    print("\n--- Test Completed ---")

from sqlalchemy import text
if __name__ == "__main__":
    asyncio.run(test_notifications())

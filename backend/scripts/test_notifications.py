import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
from services.notifications import NotificationService

async def test_notification_logic():
    print("🚀 Starting notification verification...")
    
    # Mock database session
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_db.execute.return_value = mock_result
    
    # Mock User
    mock_user = MagicMock()
    mock_user.id = 1
    mock_user.telegram_id = 123456789
    mock_user.notification_offset = 10
    mock_user.bsuir_group = "123456"
    
    # Mock Task
    now = datetime.now()
    due_soon = now + timedelta(minutes=5)
    mock_task = MagicMock()
    mock_task.user_id = 1
    mock_task.title = "Test Task"
    mock_task.is_completed = False
    mock_task.due_date = due_soon
    mock_task.subject = "Math"
    mock_task.last_reminded_at = None
    
    # Configure mock result
    mock_result.scalars.return_value.all.return_value = [mock_task]
    
    # Mock bot
    with patch("services.notifications.bot", new=AsyncMock()) as mock_bot:
        service = NotificationService()
        
        # Test Task Notification
        print("Testing task notification...")
        await service.process_user_tasks(mock_db, mock_user)
        
        # Verify bot.send_message was called
        if mock_bot.send_message.called:
            print("✅ Bot sent task notification!")
            args, kwargs = mock_bot.send_message.call_args
            print(f"Message content: {args[1]}")
        else:
            print("❌ Bot did NOT send task notification.")

        # Test Schedule Notification
        print("\nTesting schedule notification...")
        mock_current_week = 1
        mock_schedule = {
            "schedules": {
                "Понедельник": [ # Assuming today is Monday for test or whatever
                    {
                        "subject": "Physics",
                        "lessonTypeAbbrev": "ЛК",
                        "startLessonTime": (now + timedelta(minutes=5)).strftime("%H:%M"),
                        "weekNumber": [1],
                        "auditories": ["123-4"]
                    }
                ]
            }
        }
        
        with patch("services.notifications.fetch_schedule", return_value=mock_schedule), \
             patch("services.notifications.fetch_current_week", return_value=mock_current_week):
             
            # Force today to be Monday for consistent test
            with patch("services.notifications.datetime") as mock_dt:
                mock_dt.now.return_value = now
                mock_dt.strptime = datetime.strptime
                
                # Mock weekday() to return 0 (Monday)
                # Instead of mocking the whole datetime, let's just mock the methods if needed, 
                # but it's easier to just make 'now' look like a Monday.
                # 'now' in the test is datetime.now(). Let's find a Monday.
                monday = now - timedelta(days=now.weekday())
                mock_dt.now.return_value = monday
                
                await service.process_user_schedule(mock_user, mock_current_week)
                
                if mock_bot.send_message.call_count > 1:
                    print("✅ Bot sent schedule notification!")
                    args, kwargs = mock_bot.send_message.call_args
                    print(f"Message content: {args[1]}")
                else:
                    print("❌ Bot did NOT send schedule notification.")

if __name__ == "__main__":
    asyncio.run(test_notification_logic())

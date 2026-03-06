import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, timedelta
from services.notifications import NotificationService

async def test_overdue_notification():
    print("🚀 Starting overdue notification verification...")
    
    # Mock database session
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_db.execute.return_value = mock_result
    
    # Mock User
    mock_user = MagicMock()
    mock_user.id = 1
    mock_user.telegram_id = 123456789
    mock_user.notification_offset = 10
    
    # Mock Overdue Task
    now = datetime.now()
    past_due = now - timedelta(hours=1)
    
    mock_task = MagicMock()
    mock_task.user_id = 1
    mock_task.title = "Overdue Test Task"
    mock_task.is_completed = False
    mock_task.due_date = "2020-01-01" # Definitely in the past
    mock_task.linkedEventId = None
    mock_task.subject = "History"
    mock_task.overdue_notified = False
    
    # Configure mock result
    mock_result.scalars.return_value.all.return_value = [mock_task]
    
    # Mock bot
    with patch("services.notifications.bot", new=AsyncMock()) as mock_bot:
        service = NotificationService()
        
        # Test Overdue Task Notification
        print("Testing overdue notification...")
        await service.process_user_tasks(mock_db, mock_user)
        
        # Verify bot.send_message was called
        if mock_bot.send_message.called:
            print("✅ Bot sent overdue notification!")
            args, kwargs = mock_bot.send_message.call_args
            print(f"Message content: {args[1]}")
            
            if "просрочена" in args[1].lower():
                print("✅ Message contains 'просрочена'")
            else:
                print("❌ Message does NOT contain 'просрочена'")
                
            if mock_task.overdue_notified == True:
                print("✅ task.overdue_notified set to True")
            else:
                print("❌ task.overdue_notified NOT set to True")
        else:
            print("❌ Bot did NOT send overdue notification.")

        # Test that it doesn't notify twice
        print("\nTesting duplicate overdue notification...")
        mock_bot.send_message.reset_mock()
        await service.process_user_tasks(mock_db, mock_user)
        
        if not mock_bot.send_message.called:
            print("✅ Bot did NOT send duplicate notification.")
        else:
            print("❌ Bot sent DUPLICATE notification.")

if __name__ == "__main__":
    asyncio.run(test_overdue_notification())

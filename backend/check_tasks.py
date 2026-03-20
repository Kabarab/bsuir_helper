import asyncio
from sqlalchemy.future import select
from database.core import SessionLocal
from database.models import User, Task

async def check():
    async with SessionLocal() as db:
        user_result = await db.execute(select(User).where(User.telegram_id == 899052748))
        user = user_result.scalars().first()
        if not user:
            print("User 899052748 not found")
            return
        
        task_result = await db.execute(select(Task).where(Task.user_id == user.id))
        tasks = task_result.scalars().all()
        print(f"User {user.telegram_id} has {len(tasks)} tasks:")
        for t in tasks:
            print(f"- {t.id}: {t.title} (date: {t.due_date}, time: {t.due_time})")

if __name__ == "__main__":
    asyncio.run(check())

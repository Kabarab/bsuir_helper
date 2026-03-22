import asyncio
import os
import sys
import json

# Add backend dir to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.rating_update import rating_update_service
from database.core import SessionLocal
from database.models import User
from sqlalchemy.future import select

async def test_manual_update():
    print("Starting manual rating update test...")
    async with SessionLocal() as db:
        # Check user 1 (telegram_id=899052748)
        result = await db.execute(select(User).where(User.telegram_id == 899052748))
        user = result.scalars().first()
        if not user:
            print("User 899052748 not found in DB")
            return
        
        print(f"User found: {user.telegram_id}, Current Rating: {user.rating_position}, Average: {user.average_grade}")
        
        # Run update
        # await rating_update_service.update_user_data(db, user) # Use a modified version here to debug
        
        from services.bsuir_api import get_group_info, fetch_group_rating
        group_info = await get_group_info(user.bsuir_group)
        print(f"Group info: {group_info}")
        if group_info:
            sdef = group_info.get("specialityDepartmentEducationFormId")
            course = group_info.get("course")
            print(f"sdef: {sdef}, course: {course}")
            rating_list = await fetch_group_rating(sdef, course)
            print(f"Rating list: {rating_list if not isinstance(rating_list, list) else 'is list of length ' + str(len(rating_list))}")
        else:
            print("Group info NOT FOUND")
        if isinstance(rating_list, list) and len(rating_list) > 0:
            print(f"Sample studentCardNumber: {rating_list[0].get('studentCardNumber')}")
            print(f"Looking for: {user.bsuir_id}")

        await rating_update_service.update_user_data(db, user)
        await db.commit()
        
        # Refresh and check
        await db.refresh(user)
        print(f"Update completed. New Rating: {user.rating_position}, New Average: {user.average_grade}")
        print(f"Last update: {user.last_rating_update}")
        if user.grades_data:
            print(f"Grades data stored (length: {len(user.grades_data)})")
            # Try parsing it
            try:
                data = json.loads(user.grades_data)
                print(f"Parsed grades data successfully. Keys: {data.keys() if isinstance(data, dict) else 'is list'}")
            except Exception as e:
                print(f"Failed to parse grades data: {e}")
        else:
            print("WARNING: grades_data is empty")

if __name__ == "__main__":
    asyncio.run(test_manual_update())

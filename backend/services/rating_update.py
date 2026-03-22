import asyncio
import logging
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy.future import select
from database.core import SessionLocal
from database.models import User
from services.bsuir_api import fetch_group_rating, get_group_info
from services.rating import rating_service

MINSK_TZ = ZoneInfo("Europe/Minsk")
logger = logging.getLogger(__name__)

class RatingUpdateService:
    async def start(self):
        logger.info("Rating update service started")
        # Даем серверу немного времени на запуск перед первой проверкой
        await asyncio.sleep(10)
        while True:
            try:
                await self.update_all_ratings()
            except Exception as e:
                logger.error(f"Error in rating update: {e}")
            
            logger.info("Rating update service sleeping for 1 hour")
            await asyncio.sleep(3600)  # Every hour

    async def update_all_ratings(self):
        async with SessionLocal() as db:
            result = await db.execute(select(User).where(User.bsuir_id != None, User.bsuir_group != None))
            users = result.scalars().all()
            
            logger.info(f"Updating ratings and grades for {len(users)} users")
            for user in users:
                try:
                    await self.update_user_data(db, user)
                except Exception as e:
                    logger.error(f"Failed to update data for user {user.telegram_id}: {e}")
            
            await db.commit()
            logger.info("All ratings and grades updated successfully")

    async def update_user_data(self, db, user: User):
        if not user.bsuir_id or not user.bsuir_group:
            return

        # 1. Fetch group info to get specialized IDs
        group_info = await get_group_info(user.bsuir_group)
        if not group_info:
            return

        sdef = group_info.get("specialityDepartmentEducationFormId")
        course = group_info.get("course")
        if not sdef or not course:
            return

        # 2. Fetch rating list and student's detailed marks in parallel
        # Use authenticated session for both
        session = await rating_service.get_session()
        
        rating_url = f"https://iis.bsuir.by/api/v1/rating?sdef={sdef}&course={course}"
        async def fetch_rating():
            try:
                async with session.get(rating_url) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    return {"error": f"IIS returned {resp.status}"}
            except Exception as e:
                return {"error": str(e)}

        rating_task = fetch_rating()
        marks_task = rating_service.fetch_student_rating(user.bsuir_id)
        
        rating_list, subjects_data = await asyncio.gather(rating_task, marks_task)

        # 3. Process rating and average
        if isinstance(rating_list, list):
            rating_list.sort(key=lambda x: x.get("average", 0), reverse=True)
            for idx, student in enumerate(rating_list):
                if student.get("studentCardNumber") == user.bsuir_id:
                    user.average_grade = str(student.get("average", 0.0))
                    user.rating_position = idx + 1
                    break

        # 4. Process subjects/grades
        if subjects_data.get("success"):
            user.grades_data = json.dumps(subjects_data.get("data"))
        
        user.last_rating_update = datetime.now()
        logger.info(f"Updated data for user {user.telegram_id} (BSUIR ID: {user.bsuir_id})")

rating_update_service = RatingUpdateService()

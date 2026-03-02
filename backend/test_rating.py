import asyncio
import os
import sys

# add parent dir so we can import services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.rating import rating_service

async def main():
    res = await rating_service.fetch_student_rating("31870086")
    print(res)
    await rating_service.close()

if __name__ == "__main__":
    asyncio.run(main())

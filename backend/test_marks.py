import asyncio
import os
import sys

sys.path.append("/Users/nazarzukov/vtvin/bsuir-nexus/backend")

from services.rating import rating_service

async def main():
    res = await rating_service.fetch_student_rating("31870086")
    if res.get("success"):
        data = res["data"]
        marks_found = 0
        for item in data:
            if item.get("marks"):
                marks_found += 1
                print(item["lessonNameAbbrev"], item["marks"])
        print("Marks found:", marks_found)
    else:
        print("error", res)
    await rating_service.close()

if __name__ == "__main__":
    asyncio.run(main())

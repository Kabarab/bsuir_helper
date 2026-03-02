import os
import time
import aiohttp
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

# --- In-memory TTL cache for rating data ---
_rating_cache = {}
RATING_CACHE_TTL = 600  # 10 minutes

class RatingService:
    def __init__(self):
        self.username = os.getenv("BSUIR_USERNAME")
        self.password = os.getenv("BSUIR_PASSWORD")
        self.base_url = "https://iis.bsuir.by/api/v1"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://iis.bsuir.by/login',
            'Origin': 'https://iis.bsuir.by'
        }
        self._session: Optional[aiohttp.ClientSession] = None

    async def get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self.headers, timeout=aiohttp.ClientTimeout(total=300))
            # Login immediately
            await self._login()
        return self._session

    async def _login(self):
        if not self.username or not self.password:
            return
        
        # Clean credentials
        un = "".join(c for c in self.username if c.isprintable()).strip()
        pw = "".join(c for c in self.password if c.isprintable()).strip()
        
        payload = {
            "username": un,
            "password": pw,
            "rememberDevice": True
        }
        async with self._session.post(f"{self.base_url}/auth/login", json=payload) as resp:
            if resp.status != 200:
                print(f"RatingService login failed: {resp.status}")

    async def fetch_student_rating(self, student_card: str) -> Dict[str, Any]:
        """Fetch rating data for a specific student (cached 10 min)."""
        cache_key = f"student_rating:{student_card}"
        cached = _rating_cache.get(cache_key)
        if cached and (time.time() - cached['ts']) < RATING_CACHE_TTL:
            print(f"RATING CACHE HIT for {student_card}")
            return cached['data']

        session = await self.get_session()
        url = f"{self.base_url}/rating/studentRating?studentCardNumber={student_card}"
        try:
            async with session.get(url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    result = {"success": True, "data": data}
                    _rating_cache[cache_key] = {'data': result, 'ts': time.time()}
                    return result
                elif resp.status == 401:
                    # Session expired? Re-login and try once more
                    await self._login()
                    async with session.get(url) as resp2:
                        if resp2.status == 200:
                            result = {"success": True, "data": await resp2.json()}
                            _rating_cache[cache_key] = {'data': result, 'ts': time.time()}
                            return result
                return {"success": False, "error": f"IIS returned {resp.status}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def close(self):
        if self._session:
            await self._session.close()

# Singleton instance
rating_service = RatingService()


import aiohttp
import time

# --- In-memory TTL cache ---
_cache = {}

def _cache_get(key, ttl):
    """Get value from cache if not expired."""
    entry = _cache.get(key)
    if entry and (time.time() - entry['ts']) < ttl:
        return entry['data']
    return None

def _cache_set(key, data):
    """Store value in cache with current timestamp."""
    _cache[key] = {'data': data, 'ts': time.time()}

# TTL constants (seconds)
TTL_SCHEDULE = 300      # 5 min — schedule rarely changes mid-day
TTL_WEEK = 3600         # 1 hour — current week changes weekly
TTL_EMPLOYEES = 3600    # 1 hour — teacher list is static
TTL_GROUPS = 3600       # 1 hour — group list is static
TTL_FACULTIES = 3600    # 1 hour
TTL_SPECIALITIES = 3600 # 1 hour
TTL_RATING = 600        # 10 min — ratings may update more often


async def fetch_schedule(group: str):
    """Fetches real schedule from IIS BSUIR (cached 5 min)."""
    cache_key = f"schedule:{group}"
    cached = _cache_get(cache_key, TTL_SCHEDULE)
    if cached is not None:
        return cached

    url = f"https://iis.bsuir.by/api/v1/schedule?studentGroup={group}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    _cache_set(cache_key, data)
                    return data
                return {"error": f"API returned {response.status}"}
    except Exception as e:
        return {"error": str(e)}

async def fetch_current_week():
    """Fetches current week number (cached 1 hour)."""
    cache_key = "current_week"
    cached = _cache_get(cache_key, TTL_WEEK)
    if cached is not None:
        return cached

    url = "https://iis.bsuir.by/api/v1/schedule/current-week"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    _cache_set(cache_key, data)
                    return data
                return {"error": f"API returned {response.status}"}
    except Exception as e:
        return {"error": str(e)}

async def fetch_all_employees():
    """Fetches all employees (cached 1 hour)."""
    cache_key = "employees_all"
    cached = _cache_get(cache_key, TTL_EMPLOYEES)
    if cached is not None:
        return cached

    url = "https://iis.bsuir.by/api/v1/employees/all"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    _cache_set(cache_key, data)
                    return data
                return {"error": f"API returned {response.status}"}
    except Exception as e:
        return {"error": str(e)}

async def fetch_employee_schedule(url_id: str):
    """Fetches employee schedule (cached 5 min)."""
    cache_key = f"employee_schedule:{url_id}"
    cached = _cache_get(cache_key, TTL_SCHEDULE)
    if cached is not None:
        return cached

    url = f"https://iis.bsuir.by/api/v1/employees/schedule/{url_id}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    _cache_set(cache_key, data)
                    return data
                return {"error": f"API returned {response.status}"}
    except Exception as e:
        return {"error": str(e)}

async def fetch_group_rating(sdef: int, course: int):
    """Fetches group rating (cached 10 min)."""
    cache_key = f"rating:{sdef}:{course}"
    cached = _cache_get(cache_key, TTL_RATING)
    if cached is not None:
        return cached

    url = f"https://iis.bsuir.by/api/v1/rating?sdef={sdef}&course={course}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    _cache_set(cache_key, data)
                    return data
                return {"error": f"API returned {response.status}"}
    except Exception as e:
        return {"error": str(e)}

async def fetch_student_groups():
    """Fetches all student groups (cached 1 hour)."""
    cache_key = "student_groups"
    cached = _cache_get(cache_key, TTL_GROUPS)
    if cached is not None:
        return cached

    url = "https://iis.bsuir.by/api/v1/student-groups"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    _cache_set(cache_key, data)
                    return data
                return {"error": f"API returned {response.status}"}
    except Exception as e:
        return {"error": str(e)}

async def fetch_faculties():
    """Fetches faculties (cached 1 hour)."""
    cache_key = "faculties"
    cached = _cache_get(cache_key, TTL_FACULTIES)
    if cached is not None:
        return cached

    url = "https://iis.bsuir.by/api/v1/faculties"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    _cache_set(cache_key, data)
                    return data
                return {"error": f"API returned {response.status}"}
    except Exception as e:
        return {"error": str(e)}

async def fetch_specialities():
    """Fetches specialities (cached 1 hour)."""
    cache_key = "specialities"
    cached = _cache_get(cache_key, TTL_SPECIALITIES)
    if cached is not None:
        return cached

    url = "https://iis.bsuir.by/api/v1/specialities"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    _cache_set(cache_key, data)
                    return data
                return {"error": f"API returned {response.status}"}
    except Exception as e:
        return {"error": str(e)}

def get_mock_grades():
    """Mock grades data for defense."""
    return {
        "average": 9.2,
        "rating": 10,
        "subjects": [
            {"name": "ОАиП", "mark": 9},
            {"name": "КСиС", "mark": 10},
            {"name": "ОТИ", "mark": 9},
            {"name": "Физика", "mark": 8},
            {"name": "Математика", "mark": 10},
        ]
    }

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

MINSK_TZ = ZoneInfo("Europe/Minsk")

class TimeMachine:
    def __init__(self):
        self._fake_now: Optional[datetime] = None
        self._offset: float = 0  # seconds

    def set_time(self, iso_str: Optional[str]):
        if not iso_str:
            self._fake_now = None
            self._offset = 0
            return
        
        try:
            target = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
            if target.tzinfo is None:
                target = target.replace(tzinfo=MINSK_TZ)
            self._fake_now = target
            # Calculate offset from real now
            real_now = datetime.now(MINSK_TZ)
            self._offset = (target - real_now).total_seconds()
            print(f"Time Machine: Time set to {target}, offset is {self._offset}s")
        except ValueError as e:
            print(f"Time Machine Error: {e}")

    def now(self, tz=None) -> datetime:
        if self._offset == 0:
            return datetime.now(tz or MINSK_TZ)
        
        real_now = datetime.now(tz or MINSK_TZ)
        return real_now + timedelta(seconds=self._offset)

time_machine = TimeMachine()

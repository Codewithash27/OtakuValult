import time
from typing import Any, Optional


class Cache:
    def __init__(self, ttl: int = 600, max_size: int = 500):
        self.ttl = ttl
        self.max_size = max_size
        self.data: dict[tuple, tuple[Any, float]] = {}

    def get(self, key: tuple) -> Optional[Any]:
        if key not in self.data:
            return None

        value, timestamp = self.data[key]
        if time.time() - timestamp > self.ttl:
            del self.data[key]
            return None

        return value

    def set(self, key: tuple, value: Any) -> None:
        if len(self.data) >= self.max_size:
            oldest_key = min(self.data.keys(), key=lambda k: self.data[k][1])
            del self.data[oldest_key]

        self.data[key] = (value, time.time())

    def clear(self) -> None:
        self.data.clear()


_cache = Cache()


def get_cache() -> Cache:
    return _cache

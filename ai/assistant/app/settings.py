from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    internal_token: str
    provider_url: str
    provider_model: str
    provider_api_key: str
    provider_timeout_ms: int
    queue_timeout_ms: int
    max_body_bytes: int

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            internal_token=os.getenv("AI_ASSISTANT_INTERNAL_TOKEN", ""),
            provider_url=os.getenv("AI_ASSISTANT_PROVIDER_URL", "").rstrip("/"),
            provider_model=os.getenv("AI_ASSISTANT_PROVIDER_MODEL", ""),
            provider_api_key=os.getenv("AI_ASSISTANT_PROVIDER_API_KEY", ""),
            provider_timeout_ms=_bounded_int("AI_ASSISTANT_PROVIDER_TIMEOUT_MS", 20_000, 1_000, 30_000),
            queue_timeout_ms=_bounded_int("AI_ASSISTANT_QUEUE_TIMEOUT_MS", 1_000, 100, 5_000),
            max_body_bytes=_bounded_int("AI_ASSISTANT_MAX_BODY_BYTES", 2_048, 512, 8_192),
        )

    @property
    def token_ready(self) -> bool:
        return len(self.internal_token) >= 32

    @property
    def provider_ready(self) -> bool:
        return bool(self.provider_url and self.provider_model)


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return min(max(value, minimum), maximum)

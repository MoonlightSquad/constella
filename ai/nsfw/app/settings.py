"""Налаштування сервісу: тільки з env, без креденшалів сховища й бази.

Все, що тут є безпечним дефолтом, — навмисно: бокс не повинен вміти робити
помилки, яких не видно в логах (наприклад мовчки приймати тіла довільного розміру).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field

MIN_TOKEN_LENGTH = 32


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


@dataclass(frozen=True)
class Settings:
    ai_internal_token: str = field(default_factory=lambda: os.environ.get("AI_INTERNAL_TOKEN", "").strip())
    model_path: str = field(default_factory=lambda: os.environ.get("MODEL_PATH", "/app/artifacts/model.onnx").strip())
    meta_path: str = field(default_factory=lambda: os.environ.get("META_PATH", "").strip())
    intra_op_threads: int = field(default_factory=lambda: _int("AI_INTRA_OP_THREADS", 2))
    max_body_bytes: int = field(default_factory=lambda: _int("AI_MAX_BODY_BYTES", 16 * 1024 * 1024))
    queue_timeout_ms: int = field(default_factory=lambda: _int("AI_QUEUE_TIMEOUT_MS", 700))

    @property
    def resolved_meta_path(self) -> str:
        # meta.json лежить поруч із вагою; окреий шлях потрібен лише для локального запуску.
        return self.meta_path or os.path.join(os.path.dirname(self.model_path), "meta.json")

    @property
    def token_ready(self) -> bool:
        return len(self.ai_internal_token) >= MIN_TOKEN_LENGTH

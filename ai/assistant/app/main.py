from __future__ import annotations

import asyncio
import hmac
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from .generator import InvalidSuggestions, ProviderUnavailable, generate_suggestions, validate_topic
from .settings import Settings

logger = logging.getLogger("assistant.http")


class BodyTooLarge(Exception):
    pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings.from_env()
    if not settings.token_ready:
        raise RuntimeError("AI_ASSISTANT_INTERNAL_TOKEN is missing or shorter than 32 characters")
    app.state.settings = settings
    app.state.slot = asyncio.Semaphore(1)
    logger.info("ready provider_configured=%s", settings.provider_ready)
    yield


app = FastAPI(
    title="constella premium assistant",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


async def _read_json(request: Request, limit: int) -> dict:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise BodyTooLarge()
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > limit:
            raise BodyTooLarge()
        chunks.append(chunk)
    try:
        payload = json.loads(b"".join(chunks))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("invalid JSON") from None
    if not isinstance(payload, dict) or set(payload) != {"locale", "topic"}:
        raise ValueError("invalid request")
    if not isinstance(payload["locale"], str) or payload["locale"] not in {"uk", "en", "de", "fr"}:
        raise ValueError("invalid locale")
    payload["topic"] = validate_topic(payload["topic"])
    return payload


@app.get("/healthz")
async def healthz(request: Request) -> JSONResponse:
    settings: Settings = request.app.state.settings
    if not settings.provider_ready:
        return JSONResponse({"status": "unconfigured"}, status_code=503)
    return JSONResponse({"status": "ready"})


@app.post("/v1/suggest")
async def suggest(request: Request) -> JSONResponse:
    settings: Settings = request.app.state.settings
    supplied = request.headers.get("x-assistant-token", "")
    if not hmac.compare_digest(supplied.encode("utf-8"), settings.internal_token.encode("utf-8")):
        logger.warning("rejected unauthenticated assistant request")
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    if not settings.provider_ready:
        return JSONResponse({"error": "unavailable"}, status_code=503)
    try:
        await asyncio.wait_for(request.app.state.slot.acquire(), timeout=settings.queue_timeout_ms / 1000)
    except asyncio.TimeoutError:
        return JSONResponse({"error": "saturated"}, status_code=503)

    started = time.perf_counter()
    try:
        try:
            payload = await _read_json(request, settings.max_body_bytes)
        except BodyTooLarge:
            return JSONResponse({"error": "too_large"}, status_code=413)
        except ValueError:
            return JSONResponse({"error": "invalid_request"}, status_code=422)
        try:
            suggestions = await run_in_threadpool(
                generate_suggestions,
                settings,
                payload["locale"],
                payload["topic"],
            )
        except ProviderUnavailable:
            logger.warning("assistant provider unavailable")
            return JSONResponse({"error": "unavailable"}, status_code=503)
        except InvalidSuggestions:
            logger.warning("assistant provider returned an invalid response")
            return JSONResponse({"error": "invalid_response"}, status_code=502)
    finally:
        request.app.state.slot.release()

    logger.info("suggestions generated latency_ms=%.1f", (time.perf_counter() - started) * 1000)
    return JSONResponse({"suggestions": suggestions})

"""HTTP-шар інференс-сервісу. Контракт тримаємо навмисно нудним:

POST /v1/classify-image   ->  {"scores": {drawings, neutral, sexy, porn, hentai}}
Будь-який не-200 для API означає те саме: модерація не відбулася, фото йде в
людську чергу (`pending`). Тому сюди свідомо немає окремих кодів для «сміття» —
401/413/422/503 однаково безпечні, а 200 буває тільки з валідним вектором.

Ніякого збереження байтів: зображення живе в пам'яті одного запиту і не потрапляє
ні в логи, ні на диск.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from .classifier import Classifier, UndecodableImage
from .settings import Settings

logger = logging.getLogger("nsfw.http")


class BodyTooLarge(Exception):
    pass


def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    # Порогайний токен = публічний безкоштовний GPU/CPU-класифікатор. Краще контейнер,
    # який не стартує, ніж сервіс, який відповідає будь-кому.
    if not settings.token_ready:
        raise RuntimeError("AI_INTERNAL_TOKEN is missing or shorter than 32 characters")

    app.state.settings = settings
    app.state.classifier = Classifier(settings.model_path, settings.resolved_meta_path, settings.intra_op_threads)
    # Модель одна, інференсинг блокуючий: одночасно тримаємо один запит, решта
    # чекає короткий час і отримують 503 замість того, щоб розмазати CPU.
    app.state.slot = asyncio.Semaphore(1)
    logger.info("ready model=%s threads=%d", settings.model_path, settings.intra_op_threads)
    yield


app = FastAPI(
    title="constella nsfw classifier",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


async def _read_body(request: Request, limit: int) -> bytes:
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
    return b"".join(chunks)


@app.get("/healthz")
async def healthz(request: Request) -> JSONResponse:
    classifier: Classifier | None = getattr(request.app.state, "classifier", None)
    if classifier is None:
        return JSONResponse({"status": "loading"}, status_code=503)
    return JSONResponse({"status": "ready", "model": classifier.model_tag})


@app.post("/v1/classify-image")
async def classify_image(request: Request) -> JSONResponse:
    settings: Settings = request.app.state.settings
    supplied = request.headers.get("x-ai-token", "")
    if not hmac.compare_digest(supplied.encode("utf-8"), settings.ai_internal_token.encode("utf-8")):
        client = request.client.host if request.client else "unknown"
        logger.warning("rejected unauthenticated request from %s", client)
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    # Слот беремо до читання тіла: інакше за простоем в черзі накопичилося б по
    # 16 MB на з'єднання, а нам потрібен рівно один оброблюваний запит.
    try:
        await asyncio.wait_for(request.app.state.slot.acquire(), timeout=settings.queue_timeout_ms / 1000.0)
    except asyncio.TimeoutError:
        logger.warning("saturated, queued longer than %dms", settings.queue_timeout_ms)
        return JSONResponse({"error": "saturated"}, status_code=503)

    started = time.perf_counter()
    classifier: Classifier = request.app.state.classifier
    try:
        try:
            body = await _read_body(request, settings.max_body_bytes)
        except BodyTooLarge:
            logger.warning("rejected body over %d bytes", settings.max_body_bytes)
            return JSONResponse({"error": "too_large"}, status_code=413)
        try:
            scores, inference_ms = await run_in_threadpool(classifier.scores, body)
        except UndecodableImage as exc:
            logger.info("undecodable image (%d bytes): %s", len(body), exc)
            return JSONResponse({"error": "invalid_image"}, status_code=422)
    finally:
        request.app.state.slot.release()

    total_ms = (time.perf_counter() - started) * 1000.0
    logger.info(
        "classified bytes=%d infer_ms=%.1f total_ms=%.1f top=%s",
        len(body),
        inference_ms,
        total_ms,
        max(scores, key=scores.get),
    )
    return JSONResponse(
        {
            "scores": scores,
            "model": classifier.model_tag,
            "latencyMs": round(total_ms, 1),
        }
    )

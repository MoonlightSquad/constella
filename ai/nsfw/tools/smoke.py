#!/usr/bin/env python3
"""Перевірка живого сервісу з машини, звідки його видно (не всередині бокса).

    python3 tools/smoke.py --url https://ai.example.com --token "$AI_INTERNAL_TOKEN" photo.jpg

Ключові речі, яких не дає жоден unit-тест:
  - контракт відповіді збігається з тим, що очікує `parseNsfwScores` у застосунку:
    п'ять лейблів, сума ~1, усе в [0, 1];
  - невалідний токен і битий вхід справді відхиляються, а не «якось працюють»;
  - латентність на реальних фото — це числа для таймауту API і для порогів етапу 4.
Вихід 0 — усе-green; будь-який FAIL робить вихід 1, щоб скрипт можна було
поставити в deploy-pipeline.
"""

from __future__ import annotations

import argparse
import json
import ssl
import statistics
import sys
import time
import urllib.error
import urllib.request

EXPECTED = {"drawings", "neutral", "sexy", "porn", "hentai"}


def post(url: str, token: str | None, body: bytes, timeout: float = 15.0) -> tuple[int, object, float]:
    request = urllib.request.Request(f"{url.rstrip('/')}/v1/classify-image", data=body, method="POST")
    request.add_header("content-type", "image/webp")
    if token:
        request.add_header("x-ai-token", token)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
            status, payload = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, payload = error.code, error.read()
    except Exception as error:  # DNS, TLS, таймаут з'єднання
        return 0, f"transport error: {error}", (time.perf_counter() - started) * 1000
    elapsed = (time.perf_counter() - started) * 1000
    try:
        return status, json.loads(payload), elapsed
    except ValueError:
        return status, payload.decode("utf-8", "replace"), elapsed


def contract_problems(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return [f"not a JSON object: {payload!r}"]
    scores = payload.get("scores")
    if not isinstance(scores, dict):
        return ["missing `scores` object"]
    problems = []
    if set(scores) != EXPECTED:
        problems.append(f"labels {sorted(scores)} != {sorted(EXPECTED)}")
    numeric = [value for value in scores.values() if isinstance(value, (int, float))]
    for label, value in scores.items():
        if not isinstance(value, (int, float)) or not 0.0 <= value <= 1.0:
            problems.append(f"{label}={value!r} outside [0,1]")
    if len(numeric) == len(scores) and abs(sum(numeric) - 1.0) > 0.05:
        problems.append(f"probabilities sum to {sum(numeric):.4f}, not ~1")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--token", default=None)
    parser.add_argument("images", nargs="*", help="файли для виміру латентності")
    parser.add_argument("--repeat", type=int, default=5)
    parser.add_argument("--json", action="store_true", help="тихо, тільки JSON на stdout")
    args = parser.parse_args()

    failures = 0

    def report(label: str, condition: bool, detail: str) -> None:
        nonlocal failures
        if not condition:
            failures += 1
        if not args.json:
            print(f"{'ok  ' if condition else 'FAIL'} {label}: {detail}")

    wrong_token = "x" * 32 if args.token != "x" * 32 else "y" * 32

    status, payload, ms = post(args.url, None, b"")
    report("401 без токена", status == 401, f"{status} in {ms:.0f}ms")

    status, payload, ms = post(args.url, wrong_token, b"")
    report("401 з чужим токеном", status == 401, f"{status} in {ms:.0f}ms")

    status, payload, ms = post(args.url, "short", b"")
    report("401 з коротким токеном", status == 401, f"{status} in {ms:.0f}ms")

    if not args.images:
        print("не задано жодного фото: перевірено лише авторизацію.", file=sys.stderr)
        return 1 if failures else 0

    for path in args.images:
        with open(path, "rb") as handle:
            body = handle.read()

        status, payload, ms = post(args.url, args.token, b"")
        report(f"{path}: битий вхід", status == 422, f"{status} in {ms:.0f}ms")

        samples: list[float] = []
        decided = None
        for _ in range(max(args.repeat, 1)):
            status, payload, ms = post(args.url, args.token, body)
            samples.append(ms)
            if status == 200:
                decided = payload
        problems = contract_problems(decided) if decided is not None else ["не отримали 200 жодного разу"]
        detail = f"p50={statistics.median(samples):.0f}ms max={max(samples):.0f}ms"
        if decided is not None and not problems:
            detail += f" model={decided.get('model')} top={max(decided['scores'], key=decided['scores'].get)}"
        report(f"{path}: контракт", not problems, detail + (f" {problems}" if problems else ""))

        if args.json and decided is not None and not problems:
            print(json.dumps({"file": path, "p50_ms": round(statistics.median(samples), 1), **decided}, ensure_ascii=False))

    print(f"фото: {len(args.images)}, запитів на фото: {args.repeat} (перший гріє конекцію, не модель)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

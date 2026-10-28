# NSFW-класифікатор (`ai/nsfw`)

Сервіс модерації фото профілю: FastAPI + ONNX Runtime, CPU-only, одна тепла модель,
поза pnpm-workspace. Викликається синхронно з `photos.confirmUpload`
(`apps/api/src/photos/moderation.ts`); рішення (approved / pending / rejected) ухвалює
API, тут тільки оцінки.

## Контракт

`POST /v1/classify-image`, тіло — сирих байтів (`content-type: image/webp`), заголовок
`x-ai-token`. Успіх — тільки `200` з
`{"scores": {drawings, neutral, sexy, porn, hentai}, "model": ..., "latencyMs": ...}`.
Клієнт перевіряє, що сума ~1 і кожна ймовірність у `[0,1]`
(`apps/api/src/photos/decision.ts:parseNsfwScores`).

Будь-що інше — `401`, `413`, `422`, `503`, таймаут, битий JSON — для API означає одне і
те саме: **модерація не відбулася, фото йде в `pending`** (`moderation_provider='ai_unavailable'`).
Окремих кодів для «сміття» свідомо немає: безпечний наслідок однаковий.

Чому байти, а не URL на R2: бокс ніколи не бачить креденшалів сховища (це найменш довірена
позиція в системі), вхід уже нормалізований (≤1600 px, 80–300 KB замість до 10 MB), і —
головне — передача URL означала б, що ми спочатку хостимо контент у CDN, а лише потім
вирішуємо, чи можна.

## Модель

Обрана: [`LukeJacob2023/nsfw-image-detector`](https://huggingface.co/LukeJacob2023/nsfw-image-detector)
— ViT-Base, 224×224, **apache-2.0**, пінене revision `d6c321d7b1c6e2ff6e8f338bf610ce782cfae19b`
(константи вгорі `export_model.py`). Лейбли `drawings / hentai / neutral / porn / sexy` —
рівно та таксономія, на якій тримається таблиця рішень, тож купальник (`sexy`) ніколи не
авто-відхиляється, а лише потрапляє в чергу. Заявлена точність на власному eval-наборі:
0.9316 top-1, 0.9887 top-k.

Що переглянули і чому ні:

| Модель | Ліцензія | Вердикт |
| --- | --- | --- |
| `giacomoarienti/nsfw-classifier` | **cc-by-nc-nd-4.0** | не можна: некомерційна + заборона похідних (а ONNX-експорт — похідна) |
| `Falconsai/nsfw_image_detection` | apache-2.0 | не можна для нашої схеми: **2 класи** (`normal`/`nsfw`) — купальник і порно в одній корзині, сірої зони не залишається |
| `AdamCodd/vit-base-nsfw-detector` | apache-2.0, офіційні ONNX-експорти (fp32/int8) | теж 2 класи (`sfw`/`nsfw`). Гарний як дешевий префільтр у майбутньому, не як основний |
| `infinitered/nsfwjs` MobileNetV2 | MIT | правильні 5 класів, але немає офіційного ONNX (потрібен `tf2onnx` конверта TF.js-графа) і слабше на сучасних реальних фото. Лишаємо fallback'ом, якщо латентність ViT не влаштує |
| сімейство nude-net / DeepBoi / weed-detector | CC BY-NC | категорично ні |
| `Marqo/nsfw-image-detection-384` | apache-2.0 | кандидат на етап калібрування (384 px), таксономію не перевіряли |

Побічний факт: `onnx-community/nsfw-image-detector-ONNX` — чужий ре-експорт тієї самої
моделі з готовими int8/fp16/q4 (шлях `--source hub-onnx`, збірка без torch), але **у того
репо немає теґу ліцензії**. Продакшен-шлях — `--source hf`: експортуємо самі з apache-2.0
ваг і порівнюємо ONNX-сесію з transformers-еталоном на детермінованому вході; розбіжність
понад допуск зупиняє збірку.

## Файли

```
app/main.py          HTTP-шар: auth, ліміт тіла, backpressure, healthz
app/classifier.py    ORT-сесія, warm-up, перевірка sha256 ваги проти meta.json
app/decode.py        байти → 224×224 float32 NCHW (resize /255 (x-0.5)/0.5)
app/settings.py      усе з env; порогів і креденшалів тут немає навмисно
export_model.py      збірка артефактів: ONNX + int8 + verify + benchmark → meta.json
Dockerfile           два stage; у фінальному — тільки onnxruntime, без torch
docker-compose.yml   nsfw (без ports) + caddy (80/443)
Caddyfile            TLS сам, limit 16 MB, проксі тільки двох шляхів
.env.example         те, що копіюють на боксі
tools/smoke.py       перевірка живого сервісу: контракт, 401/422, латентність
```

## Розгортання на боксі

1. A-запис `ai.<ваш домен>` → IP бокса; відкриті 80 і 443 (80 обов'язково — ACME challenge).
2. Тільки Docker (`docker`, `docker compose`). Окремого користувача під AI на машину не
   заводимо, але контейнер і так не-root.
3. Секрет: `openssl rand -hex 32`. Та сама рядка — у бокс і в Vercel.
4. `cd ai/nsfw && cp .env.example .env`, заповнити `AI_INTERNAL_TOKEN`, `AI_HOSTNAME`.
   На aarch64 поставити `TORCH_INDEX_URL=` (CPU-варіанти torch уже в PyPI).
5. `docker compose up -d --build`. Перша збірка тягне ~1.5 ГБ torch для stage `model`
   і викидає його з фінального образу; далі шар кешується.
6. `python3 tools/smoke.py --url https://ai.<домен> --token "$AI_INTERNAL_TOKEN" test.jpg`
   → має бути `p50=…ms` і `top=neutral` на нешкідливому фото.
7. Фактична латентність і пам'ять: `docker compose logs nsfw | tail`,
   `docker stats --no-stream`. Числа з `meta.json` (`benchmark.warm_p50_ms`) — нижня межа
   чистої інференції на машині збірки, без декодування; рішення по
   `AI_CLASSIFY_TIMEOUT_MS` ухвалюється за реальним виміром, а не за ними.
8. Зафіксувати, на чому стоїмо: версії з `pip-freeze.txt` і `build-pip-freeze.txt` всередині
   образу, sha256 ваги з `meta.json`, digest образу (`docker images --digests`). Діапазони в
   `requirements.txt` — це старт, а не пін; продакшен-пін — той самий digest.

Сервіс **не стартує без `AI_INTERNAL_TOKEN` ≥32 символів** — краще контейнер, який лежить,
ніж безкоштовний публічний класифікатор.

## Вмикання в API (Vercel, проєкт `constella-api`)

```
AI_SERVICE_URL=https://ai.<ваш домен>
AI_INTERNAL_TOKEN=<той самий секрет>
```

Порядок, щоб нічим не ризикнути:

1. перевипустити API з **порожнім** `AI_SERVICE_URL` — поведінка рівно та, що й до
   модерації (`provider='unmoderated'`);
2. підняти бокс, пройти `smoke.py`;
3. додати `AI_SERVICE_URL` + `AI_INTERNAL_TOKEN` — далі все, що сервіс не зміг перевірити,
   чесно лежить у `pending` і видно в адмінці (`AdminConsole` → `photoQueue`);
4. **калібрування (етап 4):** кілька днів тримати `AI_NSFW_PENDING_AT` низьким (усе в чергу)
   і порівнювати вердикти моделі з рішеннями людини, перш ніж довірити авто-reject.
   Пороги: `AI_NSFW_REJECT_AT` (дефолт 0.80, сума porn+hentai), `AI_NSFW_PENDING_AT` (0.15),
   `AI_NSFW_SEXY_REVIEW_AT` (0.35). Міняються тільки env, без деплою коду.

**Відкат** = очистити `AI_SERVICE_URL` і перевипустити. Жодного «здале вимкнення модерації»
в коді немає навмисне: прапорець — одна змінна середовища.

## Що тут принципово не робиться

- Ніяких креденшалів R2/Postgres на боксі й ніяких вхідних URL на наші сховища.
- Ні retry: безпечний фолбек (`pending`) вже і є retry-політика; retry лише подвоював би
  найгіршу затримку й так синхронного завантаження.
- Ні черги jobs, `attempts`-колонки й фонового sweep-а.
- Не більше одного процесу і не більше одного водночас оброблюваного запиту: модель одна й
  тепла, worker'и подвоїли б RSS і з'їли б ядра.
- Сервіс не зберігає і не логує байти; у логах — розмір, латентність, top-лейбл.
- `moderation_provider` у БД — версія *пайплайну* (`ai-nsfw-v1`), а не архітектура моделі:
  рядки історичні, модель на боксі може змінитися, і колонка не повинна брехати заднім числом.

## Що вже перевірено локально

Сервіс стояв на живому HTTP з фальшивим ONNX-графом, але справжнім контрактом
(`pixel_values [1,3,224,224]` → `logits [1,5]`, ті самі п'ять лейблів):

```
ok  401 без токена · 401 з чужим токеном · 401 з коротким токеном
ok  битий вхід (порожнє тіло)              -> 422
ok  контракт                               -> 5 лейблів, сума ~1, model=fake-vit-local

справжній клієнт API (apps/api/src/photos/ai-client.ts) проти цього сервісу:
  валідний токен -> {"status":"pending","score":0.4009,"provider":"ai-nsfw-v1"}
  чужий токен    -> {"status":"pending","score":null,"provider":"ai_unavailable"}   # реальний 401
  сміття замісто фото -> {"status":"pending","score":null,"provider":"ai_unavailable"}  # реальний 422
```

Тобто провід (заголовки undici, бінарне тіло, таймаут, 401/422 → pending) доведений без
моделі й без бокса. **Латентність і точність — ні**: фальшивий граф важить 291 байт, тож
числа з `smoke.py` вище не мають жодного стосунку до ViT-Base на 3 vCPU.

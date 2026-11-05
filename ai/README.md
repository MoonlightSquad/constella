# AI-сервіси

Тут живе власна інференція, яку ми тримаємо на окремій машині (3 vCPU / 18 GB RAM,
CPU-only, виділена під AI повністю). **Це не pnpm-workspace-пакет і не частина
turbo-графа:** у цих сервісів своя збірка (Docker), свій рантайм (Python) і свій
деплой. `pnpm build`, `pnpm test` і Vercel їх не чіпають — і так має бути: зламаний
деплой моделі не повинен ламати збірку застосунку.

```
apps/api (Vercel)                       AI-box (один, поза Vercel)
photos.confirmUpload                    Caddy :443  ── TLS, limit тіла 16 MB
  └─ sharp → нормалізований webp              └─ nsfw :8000 (лише у внутрішній мережі)
       └─ photos/moderation.ts ───POST /v1/classify-image───  FastAPI + ONNX Runtime (CPU)
            ├─ approved  → URL у users.photos + quest          одна тепла модель, 1 запит одночасно
            ├─ pending   → людська черга admin.photoQueue
            └─ rejected  → об'єкт видалено з R2
```

## Мешканці

| Директорія | Що | Ранбук |
| --- | --- | --- |
| `nsfw/` | класифікатор фото профілю (ViT-Base, 5 класів) | [`nsfw/README.md`](nsfw/README.md) |
| `assistant/` | Premium AI Chat Coach; окремий FastAPI сервіс, увімкнений лише після затвердження провайдера | [`assistant/README.md`](assistant/README.md) |

## Конвенція для наступних

Асистент листування для Premium (`ai/assistant/`) дотримується того самого патерну:
окрема директорія → `x-*-token` → один типований клієнт на здатність
(`apps/api/src/assistant/client.ts`) → окремий Caddy route. Нічого більше спільного:
жодного «generic AI gateway», жодної маршрутизації моделей і версіювання схем.

Інтеграційний статус Premium, safety та recommendation фіч описаний у кореневому
[`PRODUCT_ROADMAP_PREMIUM_AI.md`](../PRODUCT_ROADMAP_PREMIUM_AI.md); перелічені там
міграції додаються до репозиторію, але не застосовуються до спільної production DB
агентом без окремого узгодженого deployment-кроку.

Кілька правил, які стосуються всіх сервісів цієї директорії, а не тільки NSFW:

- Бокс не отримує креденшалів R2/Postgres і не ходе за URL у наші сховища — API подає
  йому сирий вхід.
- Auth — внутрішній токен у заголовку, `hmac.compare_digest`, fail-closed, ≥32 символи,
  сервіс без токена не стартує.
- IP-allowlist свідомо немає: еґрес-IP Vercel нестабільні, а такий список ломиться тихо.
- Ні retry на клієнті: безпечний фолбек (`pending`) і є retry-політика.
- Жодного збереження чи логування вмісту, який сюди приходить.
- Вимикається все однією змінною середовища в API, без прапорців у коді.

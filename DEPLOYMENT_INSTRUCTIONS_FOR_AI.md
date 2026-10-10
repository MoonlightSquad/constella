# Constella Universal Deployment Guide & AI Prompt

Цей документ і конфігураційний файл `constella.deploy.config.json` створені для того, щоб будь-який AI-асистент або розробник міг автоматично розгорнути та налаштувати всю екосистему **Constella** (Telegram Mini App, API, Bot, БД PostGIS, Cloudflare R2, Sentry, SMTP).

---

## 🤖 Промпт для будь-якої AI (Copy-Paste)

> **Промпт для передачі в AI (ChatGPT / Claude / Cursor / Junie):**
> 
> "Привіт! Я хочу розгорнути проєкт Constella (Telegram Mini App + Fastify API + Telegram Bot). 
> Я заповнив конфігураційний файл `constella.deploy.config.json`.
> Прочитай цей файл, згенеруй необхідні `.env` файли для `apps/api`, `apps/bot`, `apps/web`, виконай Drizzle-міграції для PostgreSQL на Aiven та надай точні інструкції / команди для деплою веб-частини на Vercel та бекенду на Railway/Render/Docker."

---

## 📁 Структура конфігурації (`constella.deploy.config.json`)

Файл містить наступні секції:
1. `infrastructure` — перелік обраних провайдерів (Vercel, Railway/Render, Aiven, Cloudflare, Brevo, Sentry).
2. `telegram` — токен бота від `@BotFather`, юзернейм бота та ID адміністраторів.
3. `database` — рядок підключення до Aiven PostgreSQL з підтримкою розширення `postgis`.
4. `storage` — налаштування S3-сумісного сховища Cloudflare R2 (бакет, ключі доступу, публічний URL).
5. `monitoring` — DSN ключі Sentry для бекенду та фронтенду.
6. `email` — параметри SMTP-сервера Brevo.
7. `security` — криптографічні ключі `JWT_SECRET` та `PAYMENTS_INTERNAL_TOKEN` (мінімум 32 символи).
8. `urls` — публічні адреси фронтенду (Vercel) та бекенду (Railway/Render).
9. `vercel` — параметри для деплою Nuxt 3 веб-додатка.

---

## 🛠️ Як згенерувати `.env` файли з `constella.deploy.config.json`

### 1. `apps/api/.env` (Бекенд)
```env
NODE_ENV=production
PORT=4000
DATABASE_URL=<database.database_url>
BOT_TOKEN=<telegram.bot_token>
JWT_SECRET=<security.jwt_secret>
PAYMENTS_INTERNAL_TOKEN=<security.payments_internal_token>
WEB_APP_URL=<urls.frontend_web_app_url>
ADMIN_TELEGRAM_IDS=<telegram.admin_telegram_ids>
PHOTO_BUCKET=<storage.photo_bucket>
S3_ENDPOINT=<storage.s3_endpoint>
S3_REGION=<storage.s3_region>
S3_ACCESS_KEY_ID=<storage.s3_access_key_id>
S3_SECRET_ACCESS_KEY=<storage.s3_secret_access_key>
S3_PUBLIC_BASE_URL=<storage.s3_public_base_url>
SMTP_HOST=<email.smtp_host>
SMTP_PORT=<email.smtp_port>
SMTP_SECURE=<email.smtp_secure>
SMTP_USER=<email.smtp_user>
SMTP_PASSWORD=<email.smtp_password>
SMTP_FROM=<email.smtp_from>
SENTRY_DSN=<monitoring.sentry_dsn_backend>
```

### 2. `apps/bot/.env` (Telegram Бот)
```env
BOT_TOKEN=<telegram.bot_token>
API_INTERNAL_URL=<urls.backend_api_url>
PAYMENTS_INTERNAL_TOKEN=<security.payments_internal_token>
WEB_APP_URL=<urls.frontend_web_app_url>
```

### 3. `apps/web/.env` (Vercel Frontend)
```env
NUXT_PUBLIC_API_URL=<urls.backend_api_url>
API_PROXY_TARGET=<urls.backend_api_url>
NUXT_PUBLIC_BOT_USERNAME=<telegram.bot_username>
NUXT_PUBLIC_APP_URL=<urls.frontend_web_app_url>
NUXT_PUBLIC_SENTRY_DSN=<monitoring.sentry_dsn_frontend>
```

---

## 🚀 Покроковий план розгортання

### Крок 1. Застосування міграцій до бази даних
Перед запуском серверів необхідно створити схему та індекси в PostgreSQL (Aiven):
```bash
export DATABASE_URL="<your_aiven_database_url>"
pnpm --filter @constella/db db:migrate
```

### Крок 2. Деплой Веб-додатка на Vercel
```bash
cd apps/web
pnpm build
# або через Vercel CLI:
npx vercel --prod --yes
```

### Крок 3. Деплой API та Бота
- **Варіант Railway / Render**: підключити репозиторій, встановити `Root Directory` для API (`apps/api`) та для Бота (`apps/bot`), прописати змінні середовища.
- **Варіант Docker Compose / VPS**:
  ```bash
  docker compose -f docker-compose.production.yml up -d api bot
  ```

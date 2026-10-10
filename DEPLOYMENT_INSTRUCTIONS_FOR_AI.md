# Constella Universal Deployment Guide & AI Prompt (Vercel Serverless)

Цей документ і конфігураційний файл `constella.deploy.config.json` описують процес розгортання всієї екосистеми **Constella** (Telegram Mini App, tRPC API, Telegram Webhook Bot, Aiven PostGIS DB, Cloudflare R2, Sentry, Resend SMTP) повністю на платформі **Vercel** в єдиному проєкті без потреби в окремих серверах чи VPS.

---

## 🤖 Промпт для будь-якої AI (Copy-Paste)

> **Промпт для передачі в AI (ChatGPT / Claude / Cursor / Junie):**
> 
> "Привіт! Я хочу розгорнути проєкт Constella (Telegram Mini App + Serverless API + Telegram Webhook Bot) на Vercel. 
> Я заповнив конфігураційний файл `constella.deploy.config.json`.
> Прочитай цей файл, застосуй Drizzle-міграції для PostgreSQL на Aiven (`db:migrate`), налаштуй змінні середовища для Vercel та запусти команду деплою через Vercel CLI (або надай точні інструкції з деплою). Також активуй вебхук для Telegram бота командою `pnpm webhook:set`."

---

## 📁 Архітектура на Vercel (Розділення на піддомени)

1. **Frontend (Mini App + Admin)**: доступний на `https://app-test.constella.pp.ua`. Nuxt 3 (SSR/SPA) роздається через Vercel Global Edge Network.
2. **tRPC Serverless API**: доступний на `https://api-test.constella.pp.ua` (також проксується через `/api/*` на фронтенді). Обробляє запити онбордингу, свайпів, чату, адмінки та платежів.
3. **Telegram Webhook Bot**: працює безперервно через ендпоінт `POST /api/telegram/webhook` (або `POST https://api-test.constella.pp.ua/telegram/webhook`).
4. **Scheduled Tasks (Cron)**: щоденні оновлення стріків, захист від спаму та очищення застарілих бустів виконуються автоматично за розкладом через Vercel Cron (`0 0 * * *`).
5. **База даних**: Aiven PostgreSQL з розширенням `postgis`.
6. **Медіа-файли**: Cloudflare R2 (S3-сумісне сховище без комісії за трафік).
7. **Пошта**: Resend SMTP.
8. **Моніторинг**: Sentry.

---

## 🛠️ Змінні середовища для Vercel (Project Settings $\rightarrow$ Environment Variables)

Скопіюйте ці змінні у панель Vercel або імпортуйте з файлу `.env.vercel`:

```env
# База даних (Aiven PostgreSQL + PostGIS)
DATABASE_URL=<database.database_url>

# Telegram Бот
BOT_TOKEN=<telegram.bot_token>
BOT_USERNAME=<telegram.bot_username>
ADMIN_TELEGRAM_IDS=<telegram.admin_telegram_ids>

# Домени та маршрутизація
WEB_APP_URL=https://app-test.constella.pp.ua
NUXT_PUBLIC_BOT_USERNAME=<telegram.bot_username>
NUXT_PUBLIC_APP_URL=https://app-test.constella.pp.ua
NUXT_PUBLIC_API_URL=https://api-test.constella.pp.ua
API_PROXY_TARGET=https://api-test.constella.pp.ua

# Ключі безпеки
JWT_SECRET=<security.jwt_secret>
PAYMENTS_INTERNAL_TOKEN=<security.payments_internal_token>

# Cloudflare R2 Сховище
PHOTO_BUCKET=<storage.photo_bucket>
S3_ENDPOINT=<storage.s3_endpoint>
S3_REGION=auto
S3_ACCESS_KEY_ID=<storage.s3_access_key_id>
S3_SECRET_ACCESS_KEY=<storage.s3_secret_access_key>
S3_PUBLIC_BASE_URL=<storage.s3_public_base_url>
S3_FORCE_PATH_STYLE=false

# Пошта (Resend)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=resend
SMTP_PASSWORD=<email.smtp_password>
SMTP_FROM=Constella Support <support@test.constella.pp.ua>

# Sentry
SENTRY_DSN=<monitoring.sentry_dsn_backend>
NUXT_PUBLIC_SENTRY_DSN=<monitoring.sentry_dsn_frontend>
```

---

## 🚀 Покроковий алгоритм розгортання

### Крок 1. Автоматична синхронізація конфігурацій та генерація ключів
Запустіть скрипт для префлайт-перевірки та генерації безпекових ключів:
```bash
pnpm config:sync
```
ADMIN_EMAIL=<admin.email>
ADMIN_PASSWORD=<long-random-admin-password>
Ця команда автоматично згенерує `JWT_SECRET` та `PAYMENTS_INTERNAL_TOKEN`, перевірить коректність параметрів та оновить усі `.env` файли у проєкті, а також створить `.env.vercel`.

### Крок 2. Застосування міграцій до бази даних (Aiven)
Перед першим запуском накатіть схему та PostGIS-індекси:
```bash
export DATABASE_URL="<your_aiven_database_url>"
pnpm --filter @constella/db db:migrate
```

### Крок 3. Деплой проєкту на Vercel

#### Варіант A: Через Vercel CLI (найшвидший)
```bash
# Встановлення та авторизація (якщо не встановлено)
npx vercel link --yes
npx vercel --prod --yes
```

#### Варіант B: Через Vercel Web Dashboard
1. Імпортуйте GitHub/GitLab репозиторій.
2. Вкажіть **Framework Preset**: `Nuxt.js`.
3. Вкажіть **Root Directory**: `apps/web` (або залиште `/` з кореневим `vercel.json`).
4. Переконайтеся, що чекбокс *"Include source files outside of the Root Directory"* увімкнено.
5. Додайте змінні середовища з таблиці вище (або з файлу `.env.vercel`) та натисніть **Deploy**.

### Крок 4. Налаштування Telegram Webhook та Menu Button
Після завершення деплою на Vercel зареєструйте вебхук бота для миттєвої доставки повідомлень і налаштуйте кнопку меню:
```bash
export BOT_TOKEN="<your_bot_token>"
export WEB_APP_URL="https://app-test.constella.pp.ua"
pnpm webhook:set
```

---

## 🔄 Альтернативне розміщення (Railway / VPS)
Якщо ви бажаєте використовувати традиційний фоновий процес для бота та API, у файлі `constella.deploy.config.json` збережено секцію `optional_railway_backend`, а також готовий конфіг `docker-compose.production.yml`.

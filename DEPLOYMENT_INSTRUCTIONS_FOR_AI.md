# Constella Universal Deployment Guide & AI Prompt (Vercel Serverless)

Цей документ описує розгортання **Constella** як pnpm/Turborepo монорепозиторію. Web та Fastify API розгортаються як окремі Vercel Projects; API обробляє Telegram webhook, тож окремий постійний bot worker не потрібен.

---

## 🤖 Промпт для будь-якої AI (Copy-Paste)

> **Промпт для передачі в AI (ChatGPT / Claude / Cursor / Junie):**
>
> "Допоможи розгорнути web і Fastify API Constella як окремі Vercel Projects у pnpm/Turborepo монорепозиторії. Перевір налаштування з `DEPLOYMENT_INSTRUCTIONS_FOR_AI.md`, встанови `TELEGRAM_WEBHOOK_URL` і випадковий `TELEGRAM_WEBHOOK_SECRET`, а після production-деплою виконай `pnpm webhook:set`."

---

## Автоматичне розгортання однією командою

Скопіюй `.env.vercel.example` у локальний, gitignored файл `.env.vercel` та заповни його реальними credentials і Vercel access token:

```bash
cp .env.vercel.example .env.vercel
```

Заповни production-секрети у `.env.vercel`. Скрипт також читає `.env`, `apps/api/.env`, `apps/web/.env` та `apps/bot/.env`, але `.env.vercel` має пріоритет для деплою, а змінні, явно передані в shell, — найвищий пріоритет. Не надсилай токени й секрети в чат і не додавай локальні `.env` до Git.

Спершу запусти безпечну перевірку, що перевірить обов'язкові поля та збере всі workspace-пакети, але не змінюватиме Vercel:

```bash
pnpm deploy:vercel -- --dry-run
```

Після успішної перевірки виконай:

```bash
pnpm deploy:vercel
```

Якщо DNS API-домену ще не налаштований, розгорни застосунки, тимчасово пропустивши реєстрацію webhook:

```bash
pnpm deploy:vercel -- --skip-webhook
```

Після того як `api-test.constella.pp.ua` почне резолвитися, повторний звичайний запуск `pnpm deploy:vercel` оновить deployments і налаштує webhook.

Для повторного деплою лише одного застосунку можна використати `pnpm deploy:vercel -- --api-only` або `--web-only`; додай `--skip-webhook`, якщо DNS API ще не готовий.

Команда послідовно:

1. Перевіряє production env та запускає `pnpm build`.
2. Через Vercel API створює, якщо потрібно, проєкти `constella-api` і `constella-web` з відповідними Root Directories. Назви змінюються через `VERCEL_API_PROJECT` і `VERCEL_WEB_PROJECT` у `.env.vercel`.
3. Прив'язує `api-test.constella.pp.ua` та `app-test.constella.pp.ua` до правильних проєктів.
4. Синхронізує allowlist Production environment variables з локальних `.env`.
5. Розгортає API і Web з прапорцем `--prod`, а потім реєструє Telegram webhook та Mini App кнопку.

Для команди потрібен `VERCEL_TOKEN` у `.env.vercel`; для Team account задай `VERCEL_TEAM_ID` або `VERCEL_SCOPE`. Назви проєктів і доменів можна перевизначити відповідними `VERCEL_*` змінними у тому ж файлі. Повторний запуск використовує наявні проєкти та доменні прив'язки замість створення дублікатів. Якщо однойменний Vercel Project вже має неправильний Root Directory, скрипт зупиниться без автоматичної зміни його налаштувань.

Скрипт не може змінити DNS у реєстратора домену та не створює сторонні ресурси/credentials для PostgreSQL, Cloudflare R2, Resend або Sentry. Якщо Vercel поверне DNS verification records, додай їх у DNS-панелі; прив'язка домену та деплой можуть завершитися до поширення DNS, але сайт стане доступним за кастомним доменом лише після верифікації.

---

## 📁 Архітектура на Vercel (окремі проєкти та домени)

Створи два Vercel Projects з одного репозиторію — один Project не може призначити різні Root Directories різним доменам:

1. **Web**: `https://app-test.constella.pp.ua`, Nuxt у Project з Root Directory `apps/web`.
2. **API**: `https://api-test.constella.pp.ua`, Fastify у Project з Root Directory `apps/api`. Web звертається до API через свій `/api/*` proxy.
3. **Bot**: handlers grammY імпортуються API, який приймає `POST /telegram/webhook` на API-домені й перевіряє `TELEGRAM_WEBHOOK_SECRET`. Окремий bot worker не потрібен.
4. **Зовнішні сервіси**: Aiven PostgreSQL/PostGIS, Cloudflare R2, Resend і Sentry.

---

## 🛠️ Змінні середовища для Vercel (Project Settings $\rightarrow$ Environment Variables)

Нижче довідковий перелік. Для автоматичного завантаження з локальних `.env` запускай `pnpm vercel:env`; він надсилає лише allowlist потрібного проєкту. Не копіюй увесь `.env` в обидва проєкти.

```env
# База даних (Aiven PostgreSQL + PostGIS)
DATABASE_URL=<database.database_url>

# Telegram Бот
BOT_TOKEN=<telegram.bot_token>
TELEGRAM_WEBHOOK_SECRET=<random-32+-character-secret>
BOT_USERNAME=<telegram.bot_username>
ADMIN_TELEGRAM_IDS=<telegram.admin_telegram_ids>
ADMIN_EMAIL=<admin.email>
ADMIN_PASSWORD=<long-random-admin-password>

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

### Крок 1. Підготовка workspace та бази даних
З кореня репозиторію встанови залежності й перевір Turbo build:
```bash
pnpm install --frozen-lockfile
pnpm build
```

Turbo збирає workspace-залежності (`@constella/shared` та `@constella/db`) перед API. Не запускай `pnpm build` безпосередньо з `apps/api`: там скрипт виконує лише `tsc`, і package exports залежностей ще не матимуть зібраних `dist`-файлів. Для Vercel у `apps/api/vercel.json` налаштовано `turbo run build --filter=@constella/api...`.

Застосуй міграції окремо:
```bash
export DATABASE_URL="<your_aiven_database_url>"
pnpm --filter @constella/db db:migrate
```

### Крок 2. Налаштування Vercel Projects
`pnpm deploy:vercel` створює обидва проєкти автоматично; вручну імпортувати репозиторій не потрібно. Назви можна задати у `.env.vercel`:

| Project | Root Directory | Framework / Build |
|---|---|---|
| `constella-web` | `apps/web` | Nuxt.js; `pnpm --filter @constella/web build` |
| `constella-api` | `apps/api` | Fastify auto-detect; build command з `apps/api/vercel.json` |

За замовчуванням це `VERCEL_WEB_PROJECT=constella-web` і `VERCEL_API_PROJECT=constella-api`. Скрипт задає Root Directory та build settings під час створення і зупиняється з помилкою, якщо знайдений однойменний проєкт має іншу Root Directory. Не вказуй для API `pnpm build`: це обходить граф залежностей Turbo й викликає `Cannot find module '@constella/db'` / `@constella/shared`. API запускає Fastify під Vercel; локально його, як і раніше, запускає `pnpm --filter @constella/api start`.

### Крок 3. Синхронізація Environment Variables
Авторизуй Vercel CLI (`pnpm dlx vercel login`) і заповни локальний `.env` реальними production credentials. Скрипт читає root `.env` із перевизначеннями з `apps/api/.env` та `apps/web/.env`; токен бота також можна задати в `apps/bot/.env`. Секрети не друкуються й передаються до CLI через stdin. Якщо `TELEGRAM_WEBHOOK_SECRET` ще не задано, скрипт згенерує випадковий токен і збереже однакове значення у локальних `.env`, `apps/api/.env` та `apps/bot/.env` (усі ці файли виключені з Git).

Спочатку перевір список змінних і відсутні значення без підключення до Vercel:
```bash
pnpm vercel:env -- --dry-run
```

За потреби можна окремо синхронізувати Production-змінні; повна команда `pnpm deploy:vercel` сама запускає цей крок:
```bash
pnpm vercel:env
```

Скрипт лінкує `apps/api` і `apps/web` до проєктів із `VERCEL_API_PROJECT` та `VERCEL_WEB_PROJECT`, після чого додає/оновлює лише allowlist Production variables через Vercel CLI. Для Team account задай `VERCEL_TEAM_ID` або `VERCEL_SCOPE`.

Обов'язкові значення для API: `DATABASE_URL`, `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `JWT_SECRET`, `PAYMENTS_INTERNAL_TOKEN`, R2 credentials і SMTP credentials. Для Web потрібен `BOT_USERNAME` або `NUXT_PUBLIC_BOT_USERNAME`; URLs за замовчуванням беруться з `.env` або використовують `app-test.constella.pp.ua` і `api-test.constella.pp.ua`. Скрипт відхиляє порожні обов'язкові поля та очевидні шаблонні значення. `TELEGRAM_WEBHOOK_URL` потрібен лише локальній команді реєстрації webhook, а не Vercel runtime.

### Крок 4. Прив'язка кастомних доменів
У **Settings → Domains** додай `app-test.constella.pp.ua` до web-проєкту, а `api-test.constella.pp.ua` — до API-проєкту. Скопіюй DNS record type/value, які покаже Vercel, у DNS-панель домену та дочекайся **Valid Configuration**. Не спрямовуй обидва домени на один Project.

### Крок 5. Деплой
Для Git integration кожен Project створюватиме власний deployment після push. Через CLI зв'яжи кожен проект з відповідною директорією:
```bash
npx vercel link --cwd apps/web
npx vercel deploy --prod --cwd apps/web
npx vercel link --cwd apps/api
npx vercel deploy --prod --cwd apps/api
```

Після production-деплою API та додавання його домену виконай з кореня `pnpm webhook:set`, щоб зареєструвати webhook і налаштувати кнопку Mini App. Для цього локальний `apps/bot/.env` має містити `BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL=https://api-test.constella.pp.ua/telegram/webhook`, той самий `TELEGRAM_WEBHOOK_SECRET` та `WEB_APP_URL=https://app-test.constella.pp.ua`; не додавай секрети до Git.

Зверни увагу: Vercel не запускає постійний `startBackgroundScheduler`; для щоденних scheduler jobs потрібен окремий worker або окремо реалізований і захищений Cron endpoint. Наявні Vercel Cron налаштування видалені, бо в API ще немає такого endpoint.

---

## 🔄 Альтернативне розміщення (Railway / VPS)
Якщо ви бажаєте використовувати традиційний фоновий процес для бота та API, у файлі `constella.deploy.config.json` збережено секцію `optional_railway_backend`, а також готовий конфіг `docker-compose.production.yml`.

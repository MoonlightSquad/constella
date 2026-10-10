# Constella

Constella — сервіс знайомств для повнолітніх користувачів у Telegram Mini App та веббраузері. У репозиторії: клієнт Nuxt, Fastify API з tRPC, Telegram-бот на grammY та PostgreSQL/PostGIS зі схемою Drizzle.

> Стан релізу: продукт має MVP із реєстрацією, профілями, знайомствами, чатами, Telegram Stars і базовою адмінкою. Це не є підтвердженням готовності до широкого публічного запуску. Перед релізом обов’язково пройдіть build, міграції, платіжний та модераційний smoke test. Відомі обмеження наведено наприкінці.

## Зміст
- Можливості
- Архітектура
- Вимоги та локальне встановлення
- Конфігурація
- API та Swagger
- Адмін-панель
- Production deployment
- Логи й моніторинг
- Перевірки та відомі обмеження

## Можливості

### Користувачам
- Вхід через Telegram Mini App із перевіркою initData на сервері та web реєстрація/вхід за email і паролем.
- Онбординг профілю з віковим обмеженням 18+, містом, біографією, інтересами, часовим поясом і фотографіями через S3-сховище, конвертацію WebP та модерацію.
- Щоденна добірка профілів «Орбіта», вподобання, матчі та повернення анкети.
- Вхідні вподобання, приватні чати після матчу, взаємний обмін контактами.
- Блокування, скарги, XP, рівні, квести й досягнення.
- VIP та внутрішні покращення за Telegram Stars.

### Адміністраторам
- Доступ через серверний allowlist.
- Огляд користувачів, активності, скарг, платежів і надходжень Stars.
- Пошук користувачів та статуси active, banned, shadowbanned.
- Черга скарг, статуси розгляду й нотатка модератора.
- Журнал адміністративних змін із виконавцем, причиною, ціллю та часом.
- Черга фото: перегляд, схвалення/відхилення з аудиторським записом.
- Підтримка: приватні тікети користувачів, відповіді, призначення оператору та статуси.

## Архітектура

| Сервіс | Каталог | Призначення |
| --- | --- | --- |
| Web | apps/web | Nuxt 3 SPA, клієнт і панель /admin |
| API | apps/api | Fastify, auth/health REST, tRPC, OpenAPI/Swagger |
| Bot | apps/bot | grammY long polling, команди, платежі й сповіщення |
| DB | packages/db | Drizzle schema/migrations, PostgreSQL/PostGIS |
| Shared | packages/shared | Спільна валідація, auth, білінг і логування |

Браузерний API доступний через /api proxy Nuxt. Бот звертається до API через приватну внутрішню адресу. Long polling вимагає одного активного екземпляра бота.

## Вимоги

- Node.js 20+
- pnpm 9
- Docker Compose для локальної бази або PostgreSQL із PostGIS
- Telegram Bot token для Telegram-входу й оплат
- Публічний HTTPS домен для Telegram Mini App

## Локальне встановлення

1. Скопіюйте .env.example у корені як .env. Для локальної розробки заповніть BOT_TOKEN, WEB_APP_URL, JWT_SECRET і PAYMENTS_INTERNAL_TOKEN.
2. Виконайте pnpm install.
3. Запустіть локальну БД: docker compose up -d postgres.
4. Застосуйте міграції: pnpm db:migrate.
5. Запустіть сервіси: pnpm dev.
6. Відкрийте http://localhost:5173; API за замовчуванням слухає 4000.
7. Для тесту Telegram потрібна HTTPS адреса вебклієнта, зареєстрована у налаштуваннях бота.

Bot потребує справжній BOT_TOKEN. Не використовуйте секрети з локального Compose у production.

## Конфігурація

Приклади середовища: .env.example, apps/api/.env.example, apps/bot/.env.example, apps/web/.env.example. Production secrets задаються через сховище секретів платформи, а не у git.

| Змінна | Призначення |
| --- | --- |
| DATABASE_URL | URL PostgreSQL; у production використовуйте TLS і приватну мережу |
| POSTGRES_PASSWORD | Пароль локального Compose контейнера |
| POSTGRES_BIND_ADDRESS | Локальна адреса порту БД; не відкривайте Postgres до інтернету |
| DB_POOL_SIZE | Максимум з’єднань одного процесу API |
| BOT_TOKEN | Секрет Telegram бота |
| WEB_APP_URL | Канонічний HTTPS origin застосунку |
| SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM | SMTP relay та відправник для підтвердження email і password reset |
| JWT_SECRET | Випадковий секрет підпису JWT, мінімум 32 символи |
| PAYMENTS_INTERNAL_TOKEN | Окремий секрет між API та ботом, мінімум 32 символи |
| ADMIN_EMAIL | Email для окремого входу до веб-адмінки |
| ADMIN_PASSWORD | Довгий унікальний пароль веб-адмінки; зберігайте лише в API env |
| ADMIN_USER_IDS | Додатковий список UUID адміністраторів, розділений комами |
| ADMIN_TELEGRAM_IDS | Додатковий список числових Telegram ID адміністраторів |
| API_INTERNAL_URL | API адреса, доступна боту |
| NUXT_API_INTERNAL_BASE | API адреса, доступна Nuxt runtime |
| API_PUBLIC_URL | Публічна база OpenAPI, типово /api |
| PORT | Порт Fastify, типовий 4000 |
| LOG_LEVEL | Рівень логів: fatal/error/warn/info/debug/trace/silent |
| NODE_ENV | В production встановіть production |
| TRUST_PROXY | false за замовчуванням; задавайте лише довірені IP/CIDR proxy |
| RATE_LIMIT_MAX | Межа API запитів на IP |

Для безкоштовної відправки транзакційних листів налаштуйте Brevo Free (до 300 листів на день). У Brevo створіть SMTP key у розділі SMTP & API, підтвердьте адресу відправника, а потім задайте SMTP_HOST=smtp-relay.brevo.com, SMTP_PORT=587, SMTP_SECURE=false, SMTP_USER=<SMTP login>, SMTP_PASSWORD=<SMTP key> та SMTP_FROM із підтвердженою адресою. Потрібні саме SMTP login і SMTP key — не API key. Код уже надсилає через SMTP/Nodemailer; окремий Brevo SDK не потрібен. Без підтвердженого sender Brevo не дозволить надсилання; власний домен рекомендується для кращої доставлюваності.

У безкоштовному плані Brevo додає брендинг до листів. AWS SES — альтернатива з оплатою за використання; перед підключенням звірте актуальні квоти та умови провайдера.

Створіть окремі випадкові JWT_SECRET і PAYMENTS_INTERNAL_TOKEN. Узгодьте DB_POOL_SIZE із кількістю API реплік та лімітом БД.

## API та Swagger

- Swagger UI: /docs/
- OpenAPI JSON: /docs/json та /openapi.json
- Через Nuxt proxy: /api/docs/ та /api/openapi.json
- tRPC: /trpc/<procedure>
- Авторизовані процедури приймають Bearer JWT.

Swagger показує REST маршрути й перелік tRPC процедур. tRPC query використовує GET, mutation — POST і JSON envelope tRPC v11. Swagger assets завантажуються з зафіксованого CDN; для повністю ізольованого deployment розмістіть їх локально.

### REST маршрути

| Метод | Шлях | Доступ | Призначення |
| --- | --- | --- | --- |
| GET | /health/live | Публічний | Liveness |
| GET | /health/ready | Публічний | Готовність API та БД; 503 у разі помилки БД |
| GET | /healthcheck | Публічний | Legacy liveness |
| POST | /auth/telegram | Публічний, обмежений | Telegram initData та видача JWT |
| POST | /auth/web/register | Публічний, обмежений | Реєстрація |
| POST | /auth/web/login | Публічний, обмежений | Вхід |
| POST | /auth/web/verification/resend | Публічний, обмежений | Повторний лист підтвердження |
| POST | /auth/web/verification/complete | Публічний, обмежений | Підтвердження email |
| POST | /auth/web/password-reset/request | Публічний, обмежений | Запит на скидання пароля |
| POST | /auth/web/password-reset/complete | Публічний, обмежений | Заміна пароля та відкликання старих сесій |
| POST | /auth/account/delete | Bearer + пароль або Telegram initData | Видалення акаунта і персональних даних |
| POST | /internal/payments/pre-checkout | Сервісний токен | Перевірка Stars invoice |
| POST | /internal/payments/successful-payment | Сервісний токен | Підтвердження платежу |
| GET | /internal/users/{telegramUserId}/status | Сервісний токен | Статус entitlement |

### tRPC процедури

Користувацькі: healthcheck, me, completeProfile; photos.mine, photos.createUpload, photos.confirmUpload, photos.remove; support.create, support.mine, support.thread, support.reply, support.close; social.orbit, social.deck, social.incomingSparks, social.incomingLikes, social.swipe, social.rewind, social.setIncognito, social.setPassport, social.blockProfile, social.reportProfile, social.matches, social.chatMessages, social.sendMessage, social.shareContact, social.sendGift, social.receivedGifts, social.quests, social.completeInviteQuest; billing.status, billing.createInvoice, billing.cancelSubscription.

Адмінські:
- admin.access — доступність для поточного облікового запису.
- admin.overview — коротка статистика.
- admin.users — пошук і сторінка користувачів.
- admin.reports — черга скарг.
- admin.reviewReport — статус скарги і аудиту.
- admin.setUserStatus — зміна статусу з обов’язковим поясненням.
- admin.payments — останні платежі.
- admin.audit — журнал дій.
- admin.photoQueue, admin.reviewPhoto — фото-модерація.
- support.adminQueue, support.adminThread, support.adminReply — робота з тікетами.

## Адмін-панель

### Початкове налаштування

1. У локальному `.env.vercel` задайте `ADMIN_EMAIL` і сильний унікальний `ADMIN_PASSWORD`; цей файл ігнорується Git.
2. Запустіть `pnpm vercel:env api`, щоб передати їх як звичайні змінні конфігурації лише до API-проєкту Vercel. Команда завершується помилкою, якщо будь-яке значення відсутнє.
3. Відкрийте `/admin/login` і увійдіть із цією парою. Після входу окрема захищена панель доступна на `/admin`. За першого входу API створить службовий профіль для аудиту адміністративних дій, якщо облікового запису з такою поштою ще немає.
4. API перевіряє облікові дані серверно, обмежує спроби входу та видає адмін-сесію на 8 годин. Пароль передається лише API, не клієнтській конфігурації.
5. `ADMIN_USER_IDS` та `ADMIN_TELEGRAM_IDS` залишаються додатковими способами надати доступ наявним обліковим записам.
6. Переконайтеся, що звичайний користувач отримує відмову, а тестова модераторська дія записується у журнал.

Панель не показує точну дату народження, координати, пароль або приватні повідомлення.

### Інструменти панелі

- Огляд: реєстрації, активність за добу, скарги, платежі та сума Stars за 30 днів.
- Користувачі: пошук за ім’ям, містом або ID; active/ban/shadowban потребує причини.
- Скарги: open/reviewing/resolved/dismissed із нотаткою модератора.
- Платежі: SKU, сума, час і recurring статус; платіжні секрети не повертаються.
- Журнал: actor, action, reason, target/report і час.

## Production deployment

Конкретні команди хостингу налаштуйте згідно з його моделлю build/run. Не вважайте застосунок готовим для широкого трафіку, доки не пройдено release checklist.

### Інфраструктура та secrets

1. Створіть PostgreSQL із PostGIS у приватній мережі, TLS, автоматичними резервними копіями й тестом відновлення.
2. Налаштуйте HTTPS домен, reverse proxy/CDN і окремі процеси web, API, bot та одноразовий migration job.
3. Додайте DATABASE_URL, BOT_TOKEN, WEB_APP_URL, JWT_SECRET, PAYMENTS_INTERNAL_TOKEN, ADMIN allowlist у секрет-сховище.
4. Встановіть NODE_ENV=production. Bot та API мають мати однаковий PAYMENTS_INTERNAL_TOKEN. Web runtime потребує NUXT_API_INTERNAL_BASE, bot — API_INTERNAL_URL.
5. Налаштуйте TRUST_PROXY тільки для фактичної адреси довіреного proxy. Не довіряйте довільним X-Forwarded заголовкам.

### Release послідовність

1. На чистому checkout: pnpm install --frozen-lockfile.
2. Збірка: pnpm build.
3. Якщо build успішний, одноразово застосуйте pnpm db:migrate. Не запускайте міграції паралельно на кожній репліці.
4. Зберігайте deployment credentials у локальному `constella.deploy.config.local.json`: скопіюйте `constella.deploy.config.local.example.json` (`cp constella.deploy.config.local.example.json constella.deploy.config.local.json`) і заповніть `telegram.bot_token`, `database.database_url`, `storage.s3_access_key_id`/`s3_secret_access_key`, `email.smtp_password`, `vercel.api_token` та `cloudflare.api_token`. Файл ігнорується Git. Основний `constella.deploy.config.json` також локальний/ігнорований; на чистому checkout скрипти беруть безпечні defaults із `constella.deploy.config.example.json`. Запустіть `pnpm config:sync`, щоб локально згенерувати `.env` файли для runtime та синхронізації Vercel; Cloudflare management token у runtime/Vercel не передається. Для browser upload у R2 потрібен Cloudflare Account API token із правом `Workers R2 Storage Write`; R2 S3 `Access Key ID`/`Secret Access Key` або `Workers R2 Storage Bucket Item Write` дають доступ до об'єктів, але не змінюють CORS policy. Запустіть `node scripts/r2-cors.mjs`: скрипт отримує account ID із `S3_ENDPOINT`, зберігає інші CORS rules і перевіряє результат.
5. Запустіть API: pnpm --filter @constella/api start.
6. Запустіть web: pnpm --filter @constella/web start.
7. Запустіть один bot: pnpm --filter @constella/bot start.
8. Налаштуйте readiness /health/ready, liveness /health/live і збір stdout/stderr.
9. Перевірте production origin, Telegram login, web login/register, профіль, взаємний match, чат, block/report, admin access і Stars payment у цільовому середовищі.

### Smoke checklist перед публічним запуском

- У браузері немає помилок JS та API, мобільна версія придатна для використання.
- Telegram auth відхиляє підроблені/прострочені initData.
- Web auth, вікова перевірка та збереження профілю працюють.
- Матч, повідомлення, блокування та скарга перевірені між двома тестовими акаунтами.
- Неадміністратор не має доступу до admin процедур; адміністратор може закрити тестову скаргу з аудитом.
- Telegram Stars пройшли pre-checkout, successful payment, повторну доставку, entitlement і cancellation.
- Перевірено відновлення БД з backup і перезапуск сервісів.
- CORS, HTTPS, rate limit, proxy і health checks працюють на справжньому домені.

## Логи й моніторинг

API створює структуровані HTTP логи з request ID, latency та статусом. Winston логи мають маскувати дані, схожі на секрети. Не записуйте JWT, Telegram initData, паролі, повні платіжні payload чи текст приватних повідомлень.

Збирайте stdout/stderr у платформу, налаштуйте retention, доступ і оповіщення за 5xx/health check. Слідкуйте за DB pool, кількістю з’єднань, місцем на диску, backup, повільними запитами та платіжними помилками. Поточний rate limiter зберігає лічильники в пам’яті процесу; перед кількома API репліками потрібні спільне сховище або edge/proxy rate limiting. Регулярно виконуйте restore rehearsal.

## Команди та CI

- pnpm dev — локальні API, bot і web.
- pnpm build — Turbo build усіх пакетів.
- pnpm test — API, shared та web: валідація схем, Telegram Stars, SMTP-конфігурація, фото-валидація, профільні правила й web-маршрути.
- pnpm db:migrate — застосування Drizzle migrations.
- pnpm db:generate — генерація Drizzle migration.

CI повинен виконувати frozen install, build і tests на чистому checkout до deploy.

## Відомі обмеження перед публічним запуском

- Email verification і password reset реалізовані. Для доставки потрібен SMTP-провайдер із перевіреним доменом; відкликання довготривалих сесій і повноцінне керування пристроями ще не реалізовані.
- Видалення акаунта доступне з профілю та API; видаляються профільні зв’язки й фото, платіжний ledger анонімізується. Експорт даних та строки зберігання бухгалтерського ledger потребують окремої юридичної політики.
- Фотозавантаження перевіряє MIME/розмір, конвертує зображення у WebP і робить його доступним одразу без попередньої модерації. Адміністратори можуть приховати фото після скарги; перед публічним запуском налаштуйте bucket policy та CDN.
- Вік перевіряється за введеною датою народження; окремої перевірки особи/віку немає.
- Чат використовує polling; немає WebSocket/SSE та фонового worker для запланованих задач.
- Пошук за радіусом потребує координат; інакше відбір працює за містом.
- Rate limiting не спільний між API репліками.
- social.sendGift не завершує платіж самостійно; не вважайте подарунковий checkout робочим без повного з’єднання з Billing.
- Тікети підтримки та операторська черга працюють у продукті й адмінці. Email-сповіщення про нові відповіді ще потребують окремого worker. До відкриття доступу додайте затверджені умови, privacy policy та правила безпеки.
- Build, інтеграції Telegram і платежі повинні бути перевірені у цільовому середовищі; сама наявність коду цього не гарантує.

## Безпека

Не публікуйте токени, паролі, JWT, Telegram init data чи персональні дані в issues або логах. Повідомляйте про вразливість приватним каналом власника сервісу. Перед запуском додайте реальний контакт підтримки та юридичні документи.

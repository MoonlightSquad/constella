# Constella

Constella is a location-based social/dating product built around Telegram: users discover people nearby
(PostGIS), match, chat in realtime, complete quests and unlock features with Telegram Stars. The repo is a
pnpm + Turborepo monorepo containing the API, a grammY bot, a Nuxt web app, a marketing landing site, a
blog, and an Expo mobile app that shares one Fastify + tRPC backend.

## Repository layout

```
apps/
  api        Fastify + tRPC backend (port 4000) — auth, social, billing, photos, admin, support, blog, push
  bot        grammY Telegram bot (polling locally, webhook on Vercel)
  web        Nuxt user app (port 5173) — the product UI (Orbit / Sparks / Chats / Quests / Sky)
  landing    Nuxt marketing site (port 5174), separate Vercel project — blog, SEO, admin console
  mobile     Expo SDK 58 + expo-router app, web-parity dashboard
packages/
  shared     Domain logic: auth, billing, gamification, profile, telegram, websocket helpers
  db         Drizzle ORM schema + SQL migrations over PostgreSQL/PostGIS
  worker     Reserved placeholder (not a workspace package)
  api-client Reserved placeholder (not a workspace package)
scripts/     Deploy helpers (deploy.mjs, vercel-env.mjs, deploy-vercel.mjs)
```

## Modules

### `apps/api` — backend

Fastify server exposing a typed tRPC router (`/api/trpc`) plus REST endpoints (auth callbacks, Telegram
webhook, payment webhooks, `/healthcheck`, `/openapi.json`, `/docs`).

- **Routers**: `social` (geo discovery via `users.geo` / `ST_DWithin`, matches, chats, quests, likes),
  `billing` (Telegram Stars purchases, entitlements), `admin` (moderation, audit logs, bans),
  `support` (tickets), `photos` (S3/R2 upload + confirm flow, 6-photo cap, separate 30 MB video path
  including round «кружок» notes), `push` (Expo device tokens).
- **Realtime**: chat over WebSocket at `/api/chat/ws` (header auth on web, `?token=` on mobile since RN
  cannot set WS headers) and `/realtime/stream` (SSE).
- **Engine** (`src/engine`): gamification scheduler; disabled on Vercel (`VERCEL=1`) — scheduled jobs need
  a separate worker or a protected cron endpoint.
- **Telegram**: on Vercel there is no separate bot process; `@constella/bot` handlers are imported by the
  API, which serves `POST /telegram/webhook` guarded by `TELEGRAM_WEBHOOK_SECRET`.
- **Observability**: optional Sentry (`src/sentry.ts`, error-only, `tracesSampleRate: 0`); disabled until a
  real `SENTRY_DSN` is present.

### `apps/bot` — Telegram bot

grammY bot handling `/start` flows and account-linking codes (`/start link-<code>` completes via the API's
internal endpoint). Runs with long-polling locally (`pnpm --filter @constella/bot dev`);
`pnpm webhook:set` registers the production webhook.

### `apps/web` — user app

Nuxt 3 SPA (`ssr: false`) with i18n (uk/en/de/fr). Dashboard tabs: **Orbit** (nearby people), **Sparks**
(match chat), **Chats** (realtime rooms, media bubbles), **Quests** (live quests, achievements), **Sky**
(profile/sky view). Includes admin console, support desk, photo uploader, Telegram account linking, voice
calls signalling (`social.startCall` is a server stub — no SFU). All API traffic goes through the same-origin
`/api/*` nitro proxy (`server/api/[...path].ts`), which resolves the upstream at request time from
`NUXT_API_INTERNAL_BASE` → `API_INTERNAL_URL` → `API_PROXY_TARGET` → `NUXT_PUBLIC_API_URL`.
Optional Sentry via `@sentry/nuxt` (`sentry.client.config.ts` / `sentry.server.config.ts`).

### `apps/landing` — marketing site

A third Vercel project (`constella-landing`, default domain `constella.pp.ua`). Public site + multilingual
blog + `/admin` (CMS for posts). Content is served through its own `/api/*` nitro proxy; the admin JWT is
an httpOnly cookie scoped to `api/admin` and converted to `Authorization: Bearer` server-side — do not move
it to `localStorage`. Canonical host (`NUXT_PUBLIC_SITE_URL`) is baked into prerendered markup, hreflang,
sitemap and RSS, so changing it requires a rebuild.

### `apps/mobile` — Expo app

Expo SDK 58 + expo-router (router root `src/app`), Hermes. Screens: auth (login/register/verify/forgot/reset),
tabs (orbit/sparks/chats/quests/sky), chat & match detail, profile, support, account deletion, diagnostics.
tRPC via vanilla `createTRPCClient` + `httpBatchLink`; JWT in `expo-secure-store` (no refresh flow); Expo
push notifications; R2 photo/video uploads. Admin console and voice/video calls are deliberately not ported.
Sentry RN is optional and disabled in Expo Go (no native module) or without `EXPO_PUBLIC_SENTRY_DSN`.

### `packages/shared` and `packages/db`

`shared` holds pure domain logic (auth tokens, billing rules, gamification, profile validation, Telegram
helpers, websocket protocol) with a browser-safe entrypoint `@constella/shared/client` — mobile must import
`client`, never the root barrel (the root pulls in winston, which Metro cannot bundle). `db` is the Drizzle
schema over PostGIS (`users.geo` is `geography(Point,4326)`); migrations `0000`–`0004` are generated,
`0005`–`0011` are hand-written SQL — **never run `db:generate`** (see `AGENTS.md`).

## Stack

TypeScript (ESM everywhere), Node LTS (no `engines` pin), pnpm 9 + Turborepo, Fastify 4, tRPC 11, Drizzle ORM,
PostgreSQL 16 + PostGIS (docker-compose), grammY, Nuxt 3 (web) / Nuxt 4 (landing), Expo SDK 58 / React Native,
S3/R2 photo storage, SMTP via Brevo, Telegram Stars payments, optional Sentry (node/nuxt 11, RN 8).

## Local development

### Prerequisites

- Node (recent LTS) and `pnpm` 9 (`packageManager` is pinned)
- Docker (for the PostGIS image) — plain Postgres is not enough, migrations use `postgis`
- ngrok (only for `pnpm dev`, which tunnels the web app for Telegram OAuth)

### Setup

```bash
pnpm install
cp .env.example .env       # then fill in at least BOT_TOKEN, JWT_SECRET, POSTGRES_PASSWORD
docker compose up -d postgres
```

Point `DATABASE_URL` in `.env` at the local container
(`postgres://constella:<POSTGRES_PASSWORD>@localhost:5432/constella`) and apply migrations:

```bash
pnpm --filter @constella/db db:migrate
```

> Note: `DATABASE_URL` in a real `.env` may point at a shared remote Aiven database — check it before
> running anything that writes.

### Running services

```bash
pnpm dev                      # api + bot + web + ngrok tunnel (concurrently)
pnpm --filter @constella/api dev      # Fastify API      → http://localhost:4000
pnpm --filter @constella/web dev      # Nuxt web app     → http://localhost:5173
pnpm --filter @constella/landing dev  # Landing site     → http://localhost:5174
pnpm --filter @constella/bot dev      # Telegram bot (polling)
pnpm --filter @constella/mobile dev   # Expo Metro (works in Expo Go, no Android SDK needed)
```

The API throws at startup without `BOT_TOKEN`. For a headless smoke test without touching any database:
`BOT_TOKEN='123:dummy' VERCEL=1 node dist/index.js` (`VERCEL=1` suppresses the background scheduler).

### Build, test, typecheck

```bash
pnpm build                          # turbo build of all workspace packages
pnpm test                           # api + web + landing tests (node:test via tsx, no vitest/jest)
pnpm --filter @constella/mobile bundle   # expo export --platform android (device-free proof)
pnpm --filter @constella/mobile typecheck
```

All packages are ESM and publish only `dist/`; workspace deps (`shared`, `db`, `bot`) must be built before
`api`/`web` can resolve them — always build through turbo (`dependsOn: ["^build"]`), not bare `tsc`.
Tests colocated as `*.test.ts`; `apps/api`'s test script whitelists directories by glob, so a test in a new
subdirectory is silently skipped unless the glob is updated.

### Environment variables

Env lives in the **root `.env`** (each app also loads `../../.env` explicitly); per-app `.env` files exist
only as deploy-script overrides. See `.env.example` (local), `.env.vercel.example` (Vercel) and
`.env.production.example`. Highlights:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `POSTGRES_PASSWORD` | PostGIS connection |
| `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL` | Telegram bot / webhook |
| `JWT_SECRET`, `PAYMENTS_INTERNAL_TOKEN` | auth / payment callback signing |
| `SMTP_*` | Brevo transactional email (verification, password recovery) |
| `PHOTO_BUCKET`, `S3_*` | R2/S3 photo & video storage |
| `EXPO_PUBLIC_API_URL`, `EXPO_ACCESS_TOKEN`, `EXPO_PUSH_ACCESS_TOKEN` | mobile bundle + EAS + push |
| `SENTRY_DSN`, `NUXT_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT` | optional error monitoring; empty/placeholder DSN fully disables the SDK |
| `ADMIN_EMAIL`/`ADMIN_PASSWORD`, `ADMIN_USER_IDS`/`ADMIN_TELEGRAM_IDS` | admin access |
| `NUXT_PUBLIC_SITE_URL`, `NUXT_PUBLIC_BOT_USERNAME`, `WEB_APP_URL` | public URLs |

## Deployment

Vercel hosts three projects: the API, the web app and `constella-landing`; the mobile app ships through
EAS. The API's Vercel build command must stay `turbo run build --filter=@constella/api...` (plain
`pnpm build` bypasses the graph and fails). Full step-by-step instructions (including the deploy config
file that `scripts/deploy.mjs` consumes) are in
[`DEPLOYMENT_INSTRUCTIONS_FOR_AI.md`](DEPLOYMENT_INSTRUCTIONS_FOR_AI.md).

## Further reading

- [`AGENTS.md`](AGENTS.md) — workspace gotchas, migration rules, mobile constraints, chat media quirks.
- [`.env.example`](.env.example) / [`.env.vercel.example`](.env.vercel.example) — annotated variable list.

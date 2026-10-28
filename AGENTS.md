# AGENTS.md

This file provides guidance to the AI agent when working with code in this repository.

## Repo state

- `README.md` is an untouched Nuxt starter stub — ignore it. The real docs are `DEPLOYMENT_INSTRUCTIONS_FOR_AI.md` and `.env*.example`.
- `apps/tma/`, `apps/worker/` and `packages/api-client/` are reserved placeholders containing only a `.gitignore`. They are not workspace packages — do not add code there expecting it to build.
- `ai/` is a real directory but deliberately **not** a pnpm workspace member: `ai/nsfw/` is Python (FastAPI + ONNX Runtime) deployed with docker compose on the dedicated AI box, so `pnpm build`/turbo never touch it and it has no `package.json`. Its wire contract pairs with `apps/api/src/photos/ai-client.ts`; the deployment and model-pinning story is `ai/nsfw/README.md`. Future services go in sibling dirs (`ai/assistant/`), not in `apps/`.

## Commands

Run from the repository root: `pnpm build` (turbo), `pnpm test`, `pnpm dev` (concurrently api+bot+web+ngrok).

```bash
pnpm --filter @constella/api dev      # Fastify API, port 4000
pnpm --filter @constella/bot dev      # grammY bot (polling, local only)
pnpm --filter @constella/web dev      # Nuxt app, port 5173
pnpm --filter @constella/landing dev  # Nuxt marketing site, port 5174
pnpm --filter @constella/admin dev    # Nuxt admin console, port 5175
pnpm --filter @constella/api build    # plain `tsc`, see workspace gotcha below
pnpm --filter @constella/mobile dev # Expo start (Metro); needs no Android SDK
pnpm --filter @constella/mobile bundle # expo export --platform android, device-free proof
```

The API throws at startup without `BOT_TOKEN` (`apps/api/src/index.ts:166`); for a local tRPC smoke test `BOT_TOKEN='123:dummy' VERCEL=1 node dist/index.js` is enough — `VERCEL=1` suppresses `startBackgroundScheduler`, which otherwise runs `runSchedulerCycle` immediately and writes to whatever `DATABASE_URL` points at (currently a shared remote database).

Postgres is a docker-compose dependency (`postgis/postgis:16-3.4`), not part of the workspace: `docker compose up -d postgres`.

If a Nuxt build dies with `Cannot start service: Host version "0.28.2" does not match binary version "0.19.12"`, an esbuild optional platform binary failed to link into `node_modules/.pnpm/esbuild@<ver>/node_modules/` and esbuild is silently resolving the hoisted older binary. `pnpm install --force` relinks it; `pnpm dedupe` does not.

## Workspace gotchas

- Every package is ESM (`"type": "module"`) and publishes only `dist/` via `exports` — there is no `src` condition. Workspace deps (`@constella/shared`, `@constella/db`, `@constella/bot`) must be **built before** `apps/api` or `apps/web` can resolve them; turbo's `dependsOn: ["^build"]` handles this, a bare `tsc` in one package does not. Editing `packages/shared/src` has no effect downstream until that package is rebuilt.
- TypeScript source imports use **`.js` specifiers for `.ts` files** (`from './utils/telegram.js'`). Node runs the compiled `dist/`, so a `.ts` specifier breaks the build.
- Env lives in the **root `.env`**; each app also explicitly loads `resolve(process.cwd(), '../../.env')`. Per-app `.env` files exist only as deploy-script overrides. `.env` is a turbo `globalDependencies`, so touching it invalidates all build caches.

## Testing

No vitest/jest. Tests use Node's built-in runner via `tsx --test`, colocated as `*.test.ts` next to sources. `apps/api`'s test script **whitelists directories by glob** — a test added in a new subdirectory is silently never run unless the glob is updated.

## Mobile app (apps/mobile)

Expo SDK 58 + `expo-router` (router root is `src/app`). It is a real workspace member (`@constella/mobile`), not a web clone: parity baseline is `apps/web/components/ConstellaDashboard.vue` (five tabs orbit/sparks/chats/quests/sky), so reviewing the mobile app means diffing against that file. Admin console and voice/video calls are deliberately not ported (`social.startCall` is a server stub with no SFU).

- Import `@constella/shared/client`, never the root barrel: the root re-exports `./logger.js` → winston + `process.env`, which Metro cannot bundle. New client-safe modules go into `packages/shared/src/client.ts`; leave the `"."` export alone. Proof: `pnpm --filter @constella/mobile bundle`, then `grep -c winston` in `dist/` must be 0.
- tRPC is a vanilla `createTRPCClient` + `httpBatchLink` (no `@trpc/react-query`), same as `apps/web/plugins/trpc.ts`; the server's default JSON transformer sends `Date` as strings. JWT lives in `expo-secure-store` under `constella_token`, and any 401 clears it and redirects to `(auth)/login` — there is no refresh flow.
- The i18n dictionary is mobile-local (`src/i18n/messages.ts`, `[uk,en,de,fr]` tuples keyed exactly like `useLocale.ts`); `t()` does its own `{slot}` substitution. Hermes gaps: `URL` comes from `react-native-url-polyfill` (imported first in `src/polyfills.ts`), and times are formatted by hand in `src/utils/dates.ts` rather than `toLocale*`.
- Chat WebSocket auth requires `?token=` (RN cannot set WS headers either). Close codes 4001/4002/4003 are terminal — do not retry them — and `broadcastToMatch` echoes `chat.message` to the author, so the client must dedupe by message id. R2 uploads must `PUT` with the exact `Content-Type` `photos.createUpload` returned, or `confirmUpload` rejects.
- Push = `trpc.push.registerToken` plus `apps/api/src/push/notify.ts` (plain `fetch` against the Expo REST API). It needs migration `0011_push_devices` and reads `EXPO_PUSH_ACCESS_TOKEN` → `EXPO_ACCESS_TOKEN`; with neither, fan-out is a silent no-op. Telegram linking on mobile goes through `billing.beginTelegramLink` → `/start link-<code>` → `POST /internal/telegram-link/complete`, because the Login Widget requires a browser domain — do not "simplify" it back to the widget.
- Typed routes (`.expo/types/router.d.ts`) regenerate **only** under `expo start`: after adding a screen, run `CI=1 npx expo start` once before `pnpm --filter @constella/mobile typecheck`, or `router.push` will not know the new href.

## Domain notes

- PostgreSQL + **PostGIS**. `users.geo` is a `customType` mapping to `geography(Point,4326)`; queries use raw `sql` with `ST_MakePoint` / `ST_DWithin` / `ST_SetSRID`. Local Postgres must be the postgis image or migrations fail.
- **Never run `db:generate`** (this includes the root `pnpm db:generate`). `meta/` snapshots stop at `0004_brief_rhino`, but `_journal.json` lists 0000-0011 and migrations `0005`-`0011` are hand-written SQL. Generating diffs the new schema against the 0004 snapshot, so it emits `CREATE TABLE` for everything added since (`user_entitlements`, `photo_assets`, `admin_audit_logs`, `support_tickets`, …) and collides with the next number. Write new migrations by hand in the `0005`+ style (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) and append the `_journal.json` entry yourself, then apply with `pnpm --filter @constella/db db:migrate`. Fixing this properly means backfilling snapshots first.
- `DATABASE_URL` in the live `.env` points at a shared remote Aiven test database, and there is no `docker` in this environment, so `db:migrate` is not a local-only operation.
- On Vercel there is **no separate bot process** — `@constella/bot` handlers are imported by the API, which serves `POST /telegram/webhook` guarded by `TELEGRAM_WEBHOOK_SECRET`. `startBackgroundScheduler` therefore does not run in production; scheduled jobs need a separate worker or a protected cron endpoint.
- `apps/web` proxies `/api/*` to the API (`apps/web/server/api/[...path].ts`). The upstream is resolved **at request time** from `NUXT_API_INTERNAL_BASE` → `API_INTERNAL_URL` → `API_PROXY_TARGET` → `NUXT_PUBLIC_API_URL`, so platform env changes take effect without a rebuild.
- `apps/landing` is a **third Vercel project** (`constella-landing`, root directory `apps/landing`, default domain `constella.pp.ua`) and proxies its own `/api/*` through nitro. Nothing in its bundle calls the API from the browser, so the API's single-origin CORS allowlist never applies to it. It is now marketing + the public blog only: the CMS lives in `apps/admin`.
- `apps/admin` is the **fourth Vercel project** (`constella-admin`, `admin.constella.pp.ua`): the whole management console — users, reports, photo queue, payments, support, audit, blog CMS. Its admin JWT lives in an httpOnly cookie scoped to `path=/api` and is turned into `Authorization: Bearer` only by `apps/admin/server/api/trpc/[...path].ts` — do not move it to `localStorage`, do not let the client send its own `Authorization` (the proxy rejects one), and never add a `headers()` hook that would forward it. That proxy answers **only** for procedure names listed in `server/utils/trpc-allowlist.mjs`, splitting tRPC batch paths on `,` and checking each name and its query/mutation type; a new `adminProcedure` gets its allowlist line in the same commit. The upstream response is forwarded verbatim (status + body, never `createError`) so the batch envelope survives. Writes additionally require the double-submit `x-csrf-token` header, which `app/plugins/trpc.ts` reads per call from the `constella_csrf` cookie — the cookie only exists after the login response, so it cannot be captured once at startup. Sessions are deliberately isolated: `apps/admin` never reads or writes the web app's `constella_token`, so an admin has two separate logins. The console is single-language Ukrainian by design.
- The landing's canonical host is build-time: `NUXT_PUBLIC_SITE_URL` feeds prerendered markup, hreflang, sitemap and RSS, so it is listed in `turbo.json` `tasks.build.env` and changing it requires a rebuild.
- Never set the API's Vercel build command to `pnpm build`; it bypasses the turbo graph and fails with `Cannot find module '@constella/db'`. Use `turbo run build --filter=@constella/api...` (already in `apps/api/vercel.json`).
- Chat media never reaches `messages.kind`: `social.sendMessage` always inserts `'text'`, and the schema union has no `image`/`video`. Both clients therefore derive the bubble type from the JSON body — `mediaFromBody` + `displayKind` in `apps/mobile/src/api/types.ts` and `ConstellaDashboard.vue`. Keep the body shape `{kind:'image'|'video', url, fileName, size, round?, durationSec?}`; a plain-string body must still parse via the fallback, so do not "fix" this with a server-side kind without a migration.
- Video (including round «кружок» notes) uploads go through `photos.createVideoUpload` → `confirmVideoUpload` (30 MB cap, `video/mp4|webm` only), separate from the image path because `confirmUpload` also appends to `users.photos` and counts toward the 6-photo limit.

## Style

No ESLint, Prettier, or editorconfig — match the surrounding file. Comments and identifiers mix English and Ukrainian; keep a file's existing language.

# AGENTS.md

This file provides guidance to the AI agent when working with code in this repository.

## Repo state

- `README.md` is an untouched Nuxt starter stub — ignore it. The real docs are `DEPLOYMENT_INSTRUCTIONS_FOR_AI.md` and `.env*.example`.
- `apps/tma/`, `apps/worker/` and `packages/api-client/` are reserved placeholders containing only a `.gitignore`. They are not workspace packages — do not add code there expecting it to build.

## Commands

Run from the repository root: `pnpm build` (turbo), `pnpm test`, `pnpm dev` (concurrently api+bot+web+ngrok).

```bash
pnpm --filter @constella/api dev      # Fastify API, port 4000
pnpm --filter @constella/bot dev      # grammY bot (polling, local only)
pnpm --filter @constella/web dev      # Nuxt app, port 5173
pnpm --filter @constella/landing dev  # Nuxt marketing site, port 5174
pnpm --filter @constella/api build    # plain `tsc`, see workspace gotcha below
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

## Domain notes

- PostgreSQL + **PostGIS**. `users.geo` is a `customType` mapping to `geography(Point,4326)`; queries use raw `sql` with `ST_MakePoint` / `ST_DWithin` / `ST_SetSRID`. Local Postgres must be the postgis image or migrations fail.
- **Never run `db:generate`** (this includes the root `pnpm db:generate`). `meta/` snapshots stop at `0004_brief_rhino`, but `_journal.json` lists 0000-0009 and migrations `0005`-`0009` are hand-written SQL. Generating diffs the new schema against the 0004 snapshot, so it emits `CREATE TABLE` for everything added since (`user_entitlements`, `photo_assets`, `admin_audit_logs`, `support_tickets`, …) and collides with the next number. Write new migrations by hand in the `0005`+ style (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) and append the `_journal.json` entry yourself, then apply with `pnpm --filter @constella/db db:migrate`. Fixing this properly means backfilling snapshots first.
- `DATABASE_URL` in the live `.env` points at a shared remote Aiven test database, and there is no `docker` in this environment, so `db:migrate` is not a local-only operation.
- On Vercel there is **no separate bot process** — `@constella/bot` handlers are imported by the API, which serves `POST /telegram/webhook` guarded by `TELEGRAM_WEBHOOK_SECRET`. `startBackgroundScheduler` therefore does not run in production; scheduled jobs need a separate worker or a protected cron endpoint.
- `apps/web` proxies `/api/*` to the API (`apps/web/server/api/[...path].ts`). The upstream is resolved **at request time** from `NUXT_API_INTERNAL_BASE` → `API_INTERNAL_URL` → `API_PROXY_TARGET` → `NUXT_PUBLIC_API_URL`, so platform env changes take effect without a rebuild.
- `apps/landing` is a **third Vercel project** (`constella-landing`, root directory `apps/landing`, default domain `constella.pp.ua`) and proxies its own `/api/*` through nitro. Nothing in its bundle calls the API from the browser, so the API's single-origin CORS allowlist never applies to it. Its admin JWT lives in an httpOnly cookie scoped to `path=/api/admin` and is turned into `Authorization: Bearer` server-side — do not move it to `localStorage`, and do not let the client send its own `Authorization`.
- The landing's canonical host is build-time: `NUXT_PUBLIC_SITE_URL` feeds prerendered markup, hreflang, sitemap and RSS, so it is listed in `turbo.json` `tasks.build.env` and changing it requires a rebuild.
- Never set the API's Vercel build command to `pnpm build`; it bypasses the turbo graph and fails with `Cannot find module '@constella/db'`. Use `turbo run build --filter=@constella/api...` (already in `apps/api/vercel.json`).

## Style

No ESLint, Prettier, or editorconfig — match the surrounding file. Comments and identifiers mix English and Ukrainian; keep a file's existing language.

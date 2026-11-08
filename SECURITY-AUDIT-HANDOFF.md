# Constella security audit handoff

**Review date:** 2026-11-05 (initial pass and extended second pass, same day)
**Worktree status:** Changes are uncommitted. No production deployment or verification has been performed.

## Context and scope

This work combines an internal, point-in-time code/configuration review with a public, localized summary at the landing site. The review manually traced selected flows for authentication and account recovery; tRPC authorization and the admin boundary; Telegram identity validation and webhooks; Stars payment callbacks and idempotency; realtime authorization; media upload, storage and URL handling; privacy and account deletion; the AI-service boundary; and deployment, CI and dependency controls.

An extended second pass on 2026-11-05 went deeper on the surfaces adjacent to the two original findings — the realtime WebSocket path, the admin-console isolation chain, the object-storage lifecycle and payment fulfillment. Every claim was re-read in the source before it entered the register; findings the code did not support were dropped rather than watered down into the document.

This was not a comprehensive audit of every code path or dependency. No production or live service, secret value, `.env` value, or cloud-provider configuration was accessed. No intrusive tests, live scanners, external penetration test, or full dependency audit were performed. The public page is deliberately scoped, does not disclose exploit details, and makes no certification or broad security guarantee.

## Confirmed findings and branch status

1. **HIGH, confidence 8/10 — account deletion could leave chat media in object storage.** Account deletion did not clean up voice/video media stored separately from profile photos. This branch adds per-account cleanup for the account's upload, profile, voice and video prefixes before account records are removed. Cleanup failures stop deletion rather than silently leaving the operation incomplete. Remediation is implemented in this branch; it has not been verified in production.
2. **MEDIUM, confidence 9/10 — realtime message updates did not consistently preserve message ownership.** This branch restricts linked-message changes to the message author. Pinning derives its update from the stored message and uses a conditional update to preserve other content and avoid overwriting concurrent changes. Remediation is implemented in this branch; it has not been verified in production.

Safe public summaries and remediation status are in `SECURITY-REVIEW.md` and on `/security`. Do not add technical exploit detail or expand claims beyond the reviewed scope.

## Second-pass findings — open, not fixed, not published

The extended pass added fourteen further items, recorded with severity, confidence and code evidence in `SECURITY-REVIEW.md`. **None of them is remediated in this branch, and none of them appears on the public page.** They are ordered there by severity; the one HIGH item is a realtime-path gap where revocation state that the tRPC send path enforces is not enforced on the open chat socket.

Treat `SECURITY-REVIEW.md` as the source of truth for what is still owed, and do not summarize those items publicly, in marketing copy or in a changelog: a list of unpatched conditions in shipped code is a disclosure, not a transparency statement.

Suggested fix order, by impact and cheapness:

1. Enforce revocation state on the realtime path — the block and membership re-check that `getMatchForUser` already performs on the tRPC side, plus a per-frame session re-validation, so the socket and the tRPC path stop disagreeing about who may write.
2. Make the per-connection write budget cover every inbound frame type instead of two, and cap concurrent sockets per user and per match.
3. Treat the message body as untrusted input on the realtime path: validate it against a schema, cap its length, and restrict media URLs to the application's own storage origin before insert.
4. Fix the connection-registry leak, where a socket is registered with one object and unregistered with an equal but distinct one, so `Set.delete` never matches and every reconnect permanently widens the fan-out set.
5. Separate the admin token from the user token (own secret or audience, short expiry) and reject privileged or restricted accounts on the public web login, so the console's cookie, CSRF and allowlist layers cannot be stepped around with a long-lived bearer token.
6. Handle refunded Stars charges, cancel the recurring subscription during account deletion, and stop cascade-deleting abuse reports about a user who deletes their account.
7. Close the storage-lifecycle gaps: give the voice confirmation the same content-type check photo and video already have, bound the presigned PUT, and collect abandoned staging objects.

## Implemented changes

- Account-deletion media cleanup, storage prefix handling, regression test, and deployment/environment documentation for the required object-storage permissions.
- Realtime message action helper and focused regression tests for author-only linked changes and content-preserving, conditionally applied pin updates.
- Public `/security` landing page, footer link, styling, SEO/prerender and sitemap support, and matching copy in Ukrainian, English, German and French.
- Internal review summary with findings, status, verification limitations, operational prerequisites, and audit limitations.
- Same day: `/security` now names the two remediated findings with severity, confidence and status, adds a deployment-prerequisites block, and replaces the checkmark band that read as a production guarantee. Copy updated in all four locales, and `SECURITY-REVIEW.md` rebuilt as a findings register carrying the extended-pass results.

### Files changed

- `.env.example`
- `DEPLOYMENT_INSTRUCTIONS_FOR_AI.md`
- `SECURITY-REVIEW.md`
- `SECURITY-AUDIT-HANDOFF.md`
- `apps/api/src/index.ts`
- `apps/api/src/photos/storage.ts`
- `apps/api/src/photos/storage.test.ts`
- `apps/api/src/realtime/message-actions.ts`
- `apps/api/src/realtime/message-actions.test.ts`
- `apps/landing/app/pages/security.vue`
- `apps/landing/app/assets/css/landing.css`
- `apps/landing/app/components/landing/LandingFooter.vue`
- `apps/landing/i18n/locales/uk.json`
- `apps/landing/i18n/locales/en.json`
- `apps/landing/i18n/locales/de.json`
- `apps/landing/i18n/locales/fr.json`
- `apps/landing/nuxt.config.ts`
- `apps/landing/server/utils/sitemap.mjs`
- `apps/landing/tests/sitemap-xml.test.mjs`

## Checks and limitations

- `git diff --check` passed.
- All four landing locale JSON files parsed, and their security-page keys/items were checked for matching structure.
- The initial pass could not execute anything because Node.js, pnpm and the workspace dependencies were missing in its environment. That gap is closed: in a working environment on this branch the focused API tests pass (5 in `apps/api/src/photos/storage.test.ts`, 3 in `apps/api/src/realtime/message-actions.test.ts`), the landing suite passes (57 tests, including locale-key parity across uk/en/de/fr and the sitemap assertions), the API build (`tsc`) completes, and the landing prerender (`generate`) completes with `/security`, `/en/security`, `/de/security` and `/fr/security` written out.
- Production behavior, deployed configuration and object-storage permissions remain unverified, and no open finding has been confirmed reachable against a deployed service: they are source-level observations.

## Operational follow-ups

- Before deployment, configure and verify the API storage credentials' `ListBucket` access scoped to each account's `uploads/<user-id>/`, `profiles/<user-id>/`, `voice/<user-id>/` and `videos/<user-id>/` prefixes, and `DeleteObject` access for objects under those prefixes. Account deletion now fails if cleanup cannot complete.
- Verify CDN/intermediary cache behavior and invalidation separately; origin-object deletion does not prove cached copies are purged.
- Do not describe either fix as production-verified until deployment and appropriate verification have actually occurred.
- Repo drift worth a separate change, not part of this one: `AGENTS.md` names `apps/web/components/ConstellaDashboard.vue` as the mobile parity baseline, and that file no longer exists — the chat surfaces live under `apps/web/components/dashboard/` (for example `MediaBubble.vue`, which is where chat media URLs actually get rendered). A review that follows the AGENTS.md pointer ends up reading a path that is not there.

## Next-agent checklist

1. Inspect the complete worktree diff and this handoff; preserve existing user changes.
2. ~~In an environment with Node.js, pnpm and workspace dependencies, run the focused API tests for `apps/api/src/realtime/message-actions.test.ts` and `apps/api/src/photos/storage.test.ts`, then the API build.~~ Done — 8 tests pass, build clean. Re-run after any API change.
3. ~~Run the landing sitemap test and an appropriate landing build; verify `/security` and its four localized routes/prerender behavior.~~ Done — the suite passes and `generate` writes all four routes with both severity badges. Re-run `pnpm --filter @constella/landing test` after touching locale copy: `tests/locales.test.mjs` enforces key parity across uk/en/de/fr, rejects empty strings and forbids the characters `| @ { } <` in any message.
4. Report any test failures precisely. Do not access production or secrets as part of local validation.
5. Before deployment, verify the narrowly scoped R2 permissions and separately assess cache invalidation. Keep the work uncommitted unless explicitly asked to commit.
6. Pick up the open findings in the order above. Start with the realtime authorization gaps: they are the only HIGH items, and three of them live in the same handshake and frame switch.

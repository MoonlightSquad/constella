# Constella security audit handoff

**Review date:** 2026-11-05
**Worktree status:** Changes are uncommitted. No production deployment or verification has been performed.

## Context and scope

This work combines an internal, point-in-time code/configuration review with a public, localized summary at the landing site. The review manually traced selected flows for authentication and account recovery; tRPC authorization and the admin boundary; Telegram identity validation and webhooks; Stars payment callbacks and idempotency; realtime authorization; media upload, storage and URL handling; privacy and account deletion; the AI-service boundary; and deployment, CI and dependency controls.

This was not a comprehensive audit of every code path or dependency. No production or live service, secret value, `.env` value, or cloud-provider configuration was accessed. No intrusive tests, live scanners, external penetration test, or full dependency audit were performed. The public page is deliberately scoped, does not disclose exploit details, and makes no certification or broad security guarantee.

## Confirmed findings and branch status

1. **HIGH, confidence 8/10 — account deletion could leave chat media in object storage.** Account deletion did not clean up voice/video media stored separately from profile photos. This branch adds per-account cleanup for the account's upload, profile, voice and video prefixes before account records are removed. Cleanup failures stop deletion rather than silently leaving the operation incomplete. Remediation is implemented in this branch; it has not been verified in production.
2. **MEDIUM, confidence 9/10 — realtime message updates did not consistently preserve message ownership.** This branch restricts linked-message changes to the message author. Pinning derives its update from the stored message and uses a conditional update to preserve other content and avoid overwriting concurrent changes. Remediation is implemented in this branch; it has not been verified in production.

Safe public summaries and remediation status are in `SECURITY-REVIEW.md` and on `/security`. Do not add technical exploit detail or expand claims beyond the reviewed scope.

## Implemented changes

- Account-deletion media cleanup, storage prefix handling, regression test, and deployment/environment documentation for the required object-storage permissions.
- Realtime message action helper and focused regression tests for author-only linked changes and content-preserving, conditionally applied pin updates.
- Public `/security` landing page, footer link, styling, SEO/prerender and sitemap support, and matching copy in Ukrainian, English, German and French.
- Internal review summary with findings, status, verification limitations, operational prerequisites, and audit limitations.

### Files changed

- `.env.example`
- `DEPLOYMENT_INSTRUCTIONS_FOR_AI.md`
- `SECURITY-REVIEW.md`
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
- The focused API test and API build could not run: `pnpm` was not available, and Node.js/workspace dependencies were unavailable in the environment. Landing tests/build were not verified.
- Production behavior, deployed configuration, and object-storage permissions remain unverified.

## Operational follow-ups

- Before deployment, configure and verify the API storage credentials' `ListBucket` access scoped to each account's `uploads/<user-id>/`, `profiles/<user-id>/`, `voice/<user-id>/` and `videos/<user-id>/` prefixes, and `DeleteObject` access for objects under those prefixes. Account deletion now fails if cleanup cannot complete.
- Verify CDN/intermediary cache behavior and invalidation separately; origin-object deletion does not prove cached copies are purged.
- Do not describe either fix as production-verified until deployment and appropriate verification have actually occurred.

## Next-agent checklist

1. Inspect the complete worktree diff and this handoff; preserve existing user changes.
2. In an environment with Node.js, pnpm and workspace dependencies, run the focused API tests for `apps/api/src/realtime/message-actions.test.ts` and `apps/api/src/photos/storage.test.ts`, then the API build.
3. Run the landing sitemap test and an appropriate landing build; verify `/security` and its four localized routes/prerender behavior.
4. Report any test failures precisely. Do not access production or secrets as part of local validation.
5. Before deployment, verify the narrowly scoped R2 permissions and separately assess cache invalidation. Keep the work uncommitted unless explicitly asked to commit.

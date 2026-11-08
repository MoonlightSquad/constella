# Constella security review

**Review date:** 2026-11-05 (initial pass and extended second pass, same day)
**Review type:** Internal, point-in-time source-code and repository-configuration review.
**Not:** a penetration test, a dependency audit, a certification, or a guarantee that vulnerabilities are absent.

## Scope and method

Manually reviewed selected flows for account authentication and recovery; tRPC and admin authorization; Telegram identity validation and webhooks; Telegram Stars payment intents and callbacks; realtime authorization; media upload, storage and URL handling; account deletion and privacy; the AI-service boundary; and deployment configuration, CI and dependency controls.

The review traced relevant code paths and compared account-deletion behavior with associated database records and storage objects. It was not a comprehensive audit of every code path or dependency.

The extended second pass went deeper on the surface adjacent to the two initial findings — the realtime WebSocket path, the admin-console isolation chain, the object-storage lifecycle, and payment fulfillment — and was carried out by tracing the code with independent read-only reviewers, then re-reading every cited line to confirm each claim before it entered this register. Findings that could not be confirmed in the source were dropped.

## Findings

Register format: **severity** (HIGH / MEDIUM / LOW) with **confidence** (n/10), a short title, then **Status**, **Area**, and what was traced. Severity reflects impact and reachability in the current code, not how hard the fix is. The extended-pass items are listed by severity; each cites the code that shows it.

### Remediated in this branch

**HIGH — chat media could remain in storage after account deletion (confidence: 8/10).**
Status: remediation implemented. Area: account deletion, object storage (`apps/api/src/photos/storage.ts`, `apps/api/src/index.ts`).
Account deletion removed profile-photo objects but did not clean up voice and video chat media stored separately. This could leave media objects behind after the account was deleted. Account deletion now enumerates the account's own upload, profile, voice and video storage prefixes and deletes matching objects before removing the account records. Cleanup errors stop the deletion request rather than silently proceeding.

**MEDIUM — insufficient ownership protection for realtime message updates (confidence: 9/10).**
Status: remediation implemented. Area: realtime chat authorization (`apps/api/src/realtime/message-actions.ts`).
A chat update path did not consistently preserve message ownership, creating a risk of unintended changes to another participant's message. Linked-message updates are now restricted to their author. Pinning derives its change from the stored message and uses a conditional update so it cannot replace message content or overwrite a concurrent change.

### Open — extended second pass

None of the following is fixed. They are recorded here so they can be scheduled, not disclosed.

**1. HIGH (8/10) — a block does not take effect on the realtime chat socket.**
Area: WebSocket authorization. Evidence: the handshake at `apps/api/src/index.ts:296-315` checks only that the user is one of the two rows in `matches`, while the tRPC send path goes through `getMatchForUser` (`apps/api/src/engine/core.ts:430-450`), which additionally rejects the call when either side appears in `blockedUsers`. `blockProfile` (`apps/api/src/routers/social.ts:647-651`) records the block and does not dissolve the match. A user who has been blocked can therefore keep attaching to the room and continue to insert messages (`index.ts:354-369`), rewrite or pin messages (`414-427`) and receive the blocker's traffic.

**2. MEDIUM (8/10) — socket authorization is evaluated once, so revocation never evicts a live connection.**
Area: WebSocket session lifecycle. Evidence: `index.ts:296-335` resolves the handshake a single time and every later frame trusts that result. Neither account deletion (`index.ts:916-956`) nor an admin ban closes or re-authorizes an already-open socket, so writes keep being accepted as that user until the client disconnects.

**3. MEDIUM (8/10) — realtime connection registry leaks entries on every reconnect.**
Area: realtime fan-out. Evidence: `registerConnection` is given one object literal at `index.ts:479`, while the close handler passes a freshly built literal to `unregisterConnection` at `index.ts:460`. `Set.delete` compares by reference (`apps/api/src/realtime.ts:39-57`), so the entry is never removed and `bucket.size === 0` is never reached. The `rooms` map and each room's set grow with every reconnect, and every broadcast iterates the accumulated dead sockets.

**4. MEDIUM (8/10) — the WebSocket write budget covers only two of the seven inbound frame types.**
Area: realtime rate limiting. Evidence: `withinSendBudget` (`index.ts:318-328`) is called for `send.message` (`360`) and `send.media` (`429`) only. `send.typing`, `send.read`, `send.delivered`, `send.linked` and `send.pin` (`372-427`) are unbounded, and each performs at least one database write plus a broadcast to the whole room, with a paid Ably publish on the fan-out path (`apps/api/src/realtime.ts:90-93`). The counters are per-connection closures, so reconnecting resets the budget, and nothing caps sockets per user or per match. The HTTP limiter at `index.ts:218` sees only the upgrade request.

**5. MEDIUM (8/10) — `send.linked` stores a client-supplied message body verbatim.**
Area: realtime message integrity. Evidence: the frame handler validates only `typeof data.body === 'string'` (`index.ts:417`) and `apps/api/src/realtime/message-actions.ts:23-35` writes it straight to the row, without `MAX_WS_MESSAGE_LENGTH` and without any schema, so arbitrary fields (`kind`, `url`, `pinned`) can be smuggled into a record that both clients then parse. The WebSocket path also skips the unapproved-photo gate that the tRPC send path applies (`apps/api/src/routers/social.ts:784-800`).

**6. MEDIUM (7/10) — chat media URLs are never restricted to the application's own storage origin.**
Area: chat media, both clients. Evidence: `send.media` accepts any `data.url` up to 4096 characters (`index.ts:433-445`), and `social.sendVoiceMessage` uses a plain `z.string().url()`. `mediaFromBody` returns whatever URL is in the body (`apps/mobile/src/api/types.ts:51-68`), and `apps/web/components/dashboard/MediaBubble.vue:109,155,160` binds it directly to `img`/`video` `src`. No allowlist against `S3_PUBLIC_BASE_URL` exists in either client. A participant can therefore render attacker-hosted media, trackers or phishing content inside a message bubble that the interface presents as trusted.

**7. MEDIUM (7/10) — the admin console's isolation controls can be bypassed through the public web login.**
Area: admin authorization boundary. Evidence: `isAuthed` reads `users.role` from the database on every request (`apps/api/src/trpc.ts:64-85`) and `isAdminAccount` treats that role as the primary grant (`trpc.ts:104-105`), while `POST /auth/web/login` (`apps/api/src/index.ts:778-819`) checks neither role nor `bannedAt` and signs with the single shared JWT secret at the default 30-day expiry (`index.ts:220-223`) instead of the 8-hour token the console issues deliberately (`index.ts:684-691`). Anyone holding valid admin credentials can therefore obtain a long-lived admin-capable bearer token and call the API directly, skipping the httpOnly-cookie, CSRF and tRPC-allowlist controls that the console layers on top. This is a loss of defense in depth and of the short token lifetime, not an authentication bypass: no unprivileged account can reach it, because registration never sets a role and no profile mutation accepts one.

**8. MEDIUM (6/10) — Telegram init data stays replayable for 24 hours.**
Area: Telegram identity validation. Evidence: `verifyTelegramInitData` defaults `maxAgeSeconds` to 86400 (`apps/api/src/utils/telegram.ts:6`) and both call sites use the default (`index.ts:547`, `index.ts:931`); no used `(auth_date, hash)` pair is ever recorded. A captured init-data blob can be replayed within that window to mint a session token, including for an account that the review found in the admin path (`trpc.ts:92-101` matches the admin identity from the token's `telegramId` claim without cross-checking the identity table).

**9. MEDIUM (6/10) — refunded Telegram Stars payments keep their entitlement.**
Area: payment fulfillment. Evidence: the bot registers only `pre_checkout_query` and `message:successful_payment` (`apps/bot/src/bot.ts:108,128`), and no refund or revoked-transaction handling exists anywhere in the payment path (grep for refund/revoke across `apps/bot/src` and `apps/api/src/payments` returns nothing). A user who pays with Stars, receives the grant, and then has the charge refunded through Telegram keeps the entitlement until natural expiry.

**10. MEDIUM (6/10) — account deletion leaves billing running and mishandles related records.**
Area: account deletion, privacy, data integrity. Evidence: the deletion flow (`index.ts:916-956`) never cancels a recurring Stars subscription — that call exists only in the billing cancel path (`apps/api/src/payments/router.ts:231`), so billing can continue against a deleted account. `reports.reportedUserId` cascades on user deletion (`packages/db/src/schema.ts:339`), so an abuse report about a user is destroyed when that user deletes their account, which loses moderation history. `admin_audit_logs` keeps its free-text `reason` and `metadata` with only the foreign keys nulled (`schema.ts:350-361`), so text about the deleted person is retained.

**11. LOW–MEDIUM (7/10) — upload lifecycle: a weaker voice check, unbounded presigned PUTs, no garbage collection.**
Area: media upload and storage. Evidence: photo and video confirmation reject an object whose stored `ContentType` differs from the signed request (`apps/api/src/photos/storage.ts:148,186`); `processVoiceUpload` (`storage.ts:103-137`) has no such comparison and no content sniffing, so arbitrary bytes are republished under `voice/<user-id>/` on the public host behind an audio content-type. The presigned PUTs are signed without a content-length (`storage.ts:63-99`), so `maxBytes` is advisory and only enforced at confirm time. Abandoned objects under `uploads/` are never collected, and the repository contains no bucket-lifecycle configuration at all (only `scripts/r2-cors.mjs`).

**12. MEDIUM (5/10) — account deletion is not atomic.**
Area: account deletion. Evidence: the storage purge runs before the database transaction (`index.ts:938-953`). If the transaction then fails, the account's media is already irrecoverably deleted while the account and its rows survive. Cleanup failure aborting the request is handled correctly in the other direction.

**13. LOW (7/10) — the admin tRPC allowlist is guarded by a hand-copied expectation.**
Area: admin console. Evidence: `apps/admin/tests/trpc-allowlist.test.mjs:53-68` asserts against a literal list repeated inside the test rather than the live router, so a new `adminProcedure` or a mislabeled query/mutation pair does not fail. The allowlist itself is fail-safe in direction (an unlisted procedure is simply unreachable from the console), which is why this is a maintenance gap rather than an exposure.

**14. LOW (5/10) — the CSRF and Origin gate exists only in the admin proxy.**
Area: admin console. Evidence: `evaluateWriteIntent` in `apps/admin/server/utils/admin-guard.mjs:22-33` enforces same-site origin plus the double-submit token, but the API performs no CSRF or Origin check of its own. This is currently contained because `@fastify/jwt` is registered without cookie support (`index.ts:220-223`), so the admin cookie alone can never authenticate upstream, and the cookie is host-only with `sameSite=lax` and `path=/api`. It becomes a real exposure if the API ever learns to read a session cookie.

### Extended-pass areas reviewed with no issue found

Recording these matters as much as the findings: they are the parts of the newly covered surface that hold.

- **Payment fulfillment is idempotent and server-authoritative.** The granted product comes from the stored intent (`apps/api/src/payments/routes.ts:90,125`) against a server-generated payload, callback-supplied currency, amount and payer must equal the stored intent (`routes.ts:91-100`), amounts come from the server-side catalog (`apps/api/src/payments/telegramStars.ts:32-46`), and a unique index on `telegram_payment_charge_id` (`packages/db/src/schema.ts:189`) plus a conditional insert inside a single transaction make a retried or replayed `successful_payment` grant exactly once (`routes.ts:83-116`). No tRPC mutation can mark anything paid.
- **Telegram webhook traffic is authenticated fail-closed** — constant-time comparison against `TELEGRAM_WEBHOOK_SECRET`, with production refusing to start without it (`apps/api/src/utils/telegram-webhook.ts:5-10`, `apps/api/src/index.ts:153-154,491-494`), and the internal bot-to-API endpoints require a separate 32-byte constant-time token (`routes.ts:25-32`).
- **No self-escalation to admin.** Registration cannot set a role, no profile mutation accepts one, and the admin grant is server-side only (`apps/api/src/routers/admin.schemas.ts:82-92`).
- **Admin session storage holds up as documented.** httpOnly, `sameSite=lax`, `path=/api`, no `Domain`; the token is never written to page storage; the proxy rejects a client-supplied `Authorization` header; every admin mutation writes an `admin_audit_logs` row; the allowlist splitting logic resists comma, encoding and traversal tricks (`apps/admin/server/utils/trpc-allowlist.mjs:38-70`).
- **Socket basics.** The WS token uses the same verifier and the same sessionVersion/ban checks as HTTP (`index.ts:255-283` vs `trpc.ts:64-85`), `matchId` is UUID-validated and membership-checked, a frame cannot address another room (`index.ts:347-350`), `senderId` always comes from the token, read/delivered receipts touch only the peer's own rows, and the Ably token is scoped to a single channel.
- **Storage prefixes.** No object key is ever client-chosen; all three confirm paths require `uploads/<user-id>/` and reject `..`; the 6-photo, 10 MB and 30 MB caps are enforced server-side; staging objects are deleted after processing; and the new cleanup is prefix-scoped with continuation-token integrity (`storage.ts:105,141,178,239-261`).

## Verification and operational prerequisite

Locale JSON structure and `git diff --check` passed.

The initial pass could not execute anything, because Node.js, pnpm and the workspace dependencies were unavailable in its environment. That gap is now closed in a working environment on this branch:

- Focused API tests — `apps/api/src/photos/storage.test.ts` (5) and `apps/api/src/realtime/message-actions.test.ts` (3): **8 passed, 0 failed.**
- Landing suite — `node --test apps/landing/tests/*.test.mjs`, which includes locale-key parity and the sitemap assertions: **57 passed, 0 failed.**
- The API build (`tsc`) completes, and the landing prerender (`generate`) completes with `/security`, `/en/security`, `/de/security` and `/fr/security` all written out.

These results cover this branch's code only. The changes have not been verified in production, and no production or cloud storage configuration was inspected. The open findings above are source-level observations: none has been confirmed reachable against a deployed service.

Before deploying, configure and verify the API storage credentials: `ListBucket` must be scoped to each account's `uploads/<user-id>/`, `profiles/<user-id>/`, `voice/<user-id>/` and `videos/<user-id>/` prefixes, and `DeleteObject` must be allowed for objects in those prefixes. Without these permissions, account deletion will stop with a storage-cleanup error.

Deleting origin objects does not establish that any CDN or intermediary cache has been purged. Cache behavior and invalidation were not tested.

## Limitations

Production systems, secret values, cloud-provider settings and live traffic were not examined. No external penetration test, live scanning or comprehensive dependency audit was performed. The extended pass reviewed the realtime, admin, storage-lifecycle and fulfillment surfaces named above; other packages, the AI service in `ai/nsfw/`, and every path not cited were not re-examined. Finding 4, 11 and 14 depend on deployment topology for their real impact and were assessed from source alone. This review is not a certification, legal opinion or guarantee that vulnerabilities are absent.

# Constella security review

**Review date:** 2026-11-05
**Review type:** Internal, point-in-time source-code and repository-configuration review.

## Scope and method

Manually reviewed selected flows for account authentication and recovery; tRPC and admin authorization; Telegram identity validation and webhooks; Telegram Stars payment intents and callbacks; realtime authorization; media upload, storage and URL handling; account deletion and privacy; the AI-service boundary; and deployment configuration, CI and dependency controls.

The review traced relevant code paths and compared account-deletion behavior with associated database records and storage objects. It was not a comprehensive audit of every code path or dependency.

## Confirmed finding

**HIGH — chat media could remain in storage after account deletion (confidence: 8/10).** Account deletion removed profile-photo objects but did not clean up voice and video chat media stored separately. This could leave media objects behind after the account was deleted.

**Status in this branch: remediation implemented.** Account deletion now enumerates the account's own upload, profile, voice and video storage prefixes and deletes matching objects before removing the account records. Cleanup errors stop the deletion request rather than silently proceeding.

**MEDIUM — insufficient ownership protection for realtime message updates (confidence: 9/10).** A chat update path did not consistently preserve message ownership, creating a risk of unintended changes to another participant's message.

**Status in this branch: remediation implemented.** Linked-message updates are restricted to their author. Pinning now derives its change from the stored message and uses a conditional update so it cannot replace message content or overwrite a concurrent change.

## Verification and operational prerequisite

Locale JSON structure and `git diff --check` passed. Focused API tests and build could not be run because Node.js, pnpm and installed dependencies were unavailable in the review environment. These code changes have not been independently verified in production. No production or cloud storage configuration was inspected.

Before deploying, configure and verify the API storage credentials: `ListBucket` must be scoped to each account's `uploads/<user-id>/`, `profiles/<user-id>/`, `voice/<user-id>/` and `videos/<user-id>/` prefixes, and `DeleteObject` must be allowed for objects in those prefixes. Without these permissions, account deletion will stop with a storage-cleanup error.

Deleting origin objects does not establish that any CDN or intermediary cache has been purged. Cache behavior and invalidation were not tested.

## Limitations

Production systems, secret values, cloud-provider settings and live traffic were not examined. No external penetration test, live scanning or comprehensive dependency audit was performed. This review is not a certification, legal opinion or guarantee that vulnerabilities are absent.

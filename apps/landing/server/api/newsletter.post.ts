import { hitCooldown, parseSignup, subscriberPayload } from '../utils/newsletter.mjs';

const COOLDOWN_MS = 60_000;
const attempts = new Map<string, number>();

const NOT_READY = 'Newsletter is not accepting signups yet.';
const BUSY = 'Newsletter is busy, please try again later.';

export default eventHandler(async (event) => {
  const outcome = parseSignup(await readBody<Record<string, unknown> | null>(event));
  // A filled hidden field is a bot: answer as if it worked, so it learns nothing.
  if (outcome.kind === 'trap') return { ok: true };
  if (outcome.kind === 'invalid') throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.' });

  const ip = String(getRequestIP(event, { xForwardedFor: true }) ?? 'unknown');
  if (hitCooldown(attempts, ip, Date.now(), COOLDOWN_MS)) {
    throw createError({ statusCode: 429, statusMessage: 'Please try again in a minute.' });
  }

  const { esp } = useRuntimeConfig(event);
  if (!esp.apiToken || !esp.groupId) throw createError({ statusCode: 503, statusMessage: NOT_READY });

  let status: number;
  try {
    const response = await fetch(`${esp.baseUrl.replace(/\/+$/, '')}/subscribers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${esp.apiToken}`, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(subscriberPayload(outcome.email, ip, esp.groupId)),
      signal: AbortSignal.timeout(4_000),
    });
    status = response.status;
  } catch (cause) {
    console.warn('[newsletter] upstream unreachable:', cause);
    throw createError({ statusCode: 503, statusMessage: BUSY });
  }

  // 201 created, 200 already on the list: the visitor only needs to know a mail is coming.
  if (status === 200 || status === 201) return { ok: true };
  // The ESP's error body never travels back — it names groups, ids and account state that
  // belong to us. The status stays in the server log, where an operator can read it.
  console.warn(`[newsletter] upstream answered ${status} for a signup`);
  if (status === 422) throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address.' });
  throw createError({ statusCode: 503, statusMessage: BUSY });
});

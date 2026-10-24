import type { H3Event } from 'h3';
import { evaluateAdminRequest, evaluateWriteIntent, requestHost } from './admin-guard.mjs';
import { createCsrfToken } from './csrf.mjs';
import { resolveApiInternalSource } from './api-base.mjs';

/**
 * Cookie names. The session cookie is scoped to /api/admin so it is never attached to a
 * marketing request, and the CSRF cookie has to be readable from /admin/** pages, which
 * is why it is the only one with path /.
 */
export const ADMIN_SESSION_COOKIE = 'constella_admin';
export const ADMIN_CSRF_COOKIE = 'constella_csrf';

// The API signs 8h tokens and has no refresh; 2 minutes of slack keeps the browser from
// holding a cookie that the upstream already rejects.
const SESSION_TTL_SECONDS = 8 * 3600 - 120;

const isHttps = (event: H3Event) =>
  String(getRequestHeader(event, 'x-forwarded-proto') || getRequestURL(event).protocol).startsWith('https');

const cookieOptions = (event: H3Event, maxAge: number) => ({
  httpOnly: true,
  secure: isHttps(event),
  sameSite: 'lax' as const,
  path: '/api/admin',
  maxAge,
});

export const setAdminSession = (event: H3Event, token: string) => {
  // A JWT over ~3 KB is silently dropped by some proxies, which would look like a login
  // that succeeds and then 401s on every call.
  if (Buffer.byteLength(token, 'utf8') > 3072) {
    throw createError({ statusCode: 502, statusMessage: 'Admin token is too large for a cookie.' });
  }
  setCookie(event, ADMIN_SESSION_COOKIE, token, cookieOptions(event, SESSION_TTL_SECONDS));
  // Double-submit value: not a secret from the page, only a secret from another origin.
  setCookie(event, ADMIN_CSRF_COOKIE, createCsrfToken(), { ...cookieOptions(event, SESSION_TTL_SECONDS), httpOnly: false, path: '/' });
};

/** Deletion must repeat the attributes, or the browser keeps the original cookie. */
export const clearAdminSession = (event: H3Event) => {
  deleteCookie(event, ADMIN_SESSION_COOKIE, { path: '/api/admin' });
  deleteCookie(event, ADMIN_CSRF_COOKIE, { path: '/' });
};

const guardInput = (event: H3Event) => ({
  method: event.method,
  authorization: getRequestHeader(event, 'authorization'),
  session: getCookie(event, ADMIN_SESSION_COOKIE),
  csrfCookie: getCookie(event, ADMIN_CSRF_COOKIE),
  csrfHeader: getRequestHeader(event, 'x-csrf-token'),
  origin: getRequestHeader(event, 'origin'),
  referer: getRequestHeader(event, 'referer'),
  host: requestHost({ host: getRequestHeader(event, 'host'), forwardedHost: getRequestHeader(event, 'x-forwarded-host') }),
});

/** Same-site + CSRF only: used by logout, which must work with an expired token. */
export const requireWriteIntent = (event: H3Event) => {
  const input = guardInput(event);
  const decision = evaluateWriteIntent(input);
  if (!decision.ok) {
    throw createError({ statusCode: decision.status, statusMessage: decision.error });
  }
};

/**
 * Gate 1-4 of the threat model, in one place: no Authorization header from the client,
 * a shaped session cookie, same-site origin and a matching CSRF token for every write.
 * Revocation itself is the API's job (`/blog/admin/*` re-reads sessionVersion/bannedAt),
 * so nitro does not add a second roundtrip per request.
 */
export const requireAdminSession = (event: H3Event) => {
  const decision = evaluateAdminRequest(guardInput(event));
  if (!decision.ok) {
    throw createError({ statusCode: decision.status, statusMessage: decision.error });
  }
  return decision.token as string;
};

/**
 * Admin write bodies are objects, and they are refused here rather than upstream when
 * they are larger than the API's own 1 MiB transport limit.
 */
export const readAdminBody = async (event: H3Event) => {
  const body = await readBody<Record<string, unknown> | null>(event);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'Очікувався JSON.' });
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 1_000_000) {
    throw createError({ statusCode: 413, statusMessage: 'Тіло запиту перевищує 1 МБ.' });
  }
  return body;
};

/**
 * Post ids are forwarded into a URL path upstream, so the shape is checked here first:
 * a stray `../` or a non-hex id must not leave this process.
 */
export const adminPostId = (event: H3Event) => {
  const id = getRouterParam(event, 'id') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Пост не знайдено.' });
  }
  return id;
};

export type AdminProxyOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, unknown>;
  body?: unknown;
};

/**
 * Forwards an already-guarded request to the API. Only `content-type` is copied upward:
 * `cookie` and `x-forwarded-*` stay here, so the upstream cannot be told a forged host.
 */
export const adminProxy = async <T>(event: H3Event, path: string, options: AdminProxyOptions = {}) => {
  const token = requireAdminSession(event);
  const { method = 'GET', query, body } = options;
  const url = new URL(path.replace(/^\//, ''), `${resolveApiInternalSource(process.env, useRuntimeConfig(event).apiInternalBase).base}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  const data = text ? safeJson(text) : null;
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error || `Blog upstream ${response.status}`;
    throw createError({ statusCode: response.status, statusMessage: message });
  }
  return data as T;
};

const safeJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

import { csrfMatches } from './csrf.mjs';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** `Bearer` only, three base64url segments: a cookie that is not that shape is not a session. */
const isJwtShape = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(value);

const hostnameOf = (value) => {
  if (typeof value !== 'string' || !value) return null;
  try {
    // `Origin` is an origin, `Referer` is a full URL; both reduce to a hostname.
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Same-site + CSRF gate for anything that changes state. Split out because logout has to
 * run it even when the session cookie is already dead.
 */
export function evaluateWriteIntent({ method, origin, referer, host, csrfCookie, csrfHeader }) {
  if (SAFE_METHODS.has(String(method).toUpperCase())) return { ok: true };
  const self = hostnameOf(`http://${host || ''}`);
  const source = hostnameOf(origin) ?? hostnameOf(referer);
  if (!self || !source || source !== self) {
    return { ok: false, status: 403, error: 'Request did not originate from this site.' };
  }
  if (!csrfMatches(csrfHeader, csrfCookie)) {
    return { ok: false, status: 403, error: 'Missing or mismatched CSRF token.' };
  }
  return { ok: true };
}

/**
 * The checks nitro runs before it will attach a bearer token to an upstream request.
 *
 * The admin bundle is public JavaScript on the same origin, so "the browser has a cookie"
 * is not authorisation: these gates exist so that a token can never be read, echoed or
 * forged from the page, and so that a cross-site POST cannot ride the cookie. Revocation
 * (sessionVersion, bannedAt) stays with the API, which re-reads the account row.
 */
export function evaluateAdminRequest({ method, authorization, session, csrfCookie, csrfHeader, origin, referer, host }) {
  if (authorization !== undefined && authorization !== '') {
    // A client that brings its own Authorization header is either a bug or an attempt to
    // smuggle a token through a cookie jar; the proxy is the only place tokens belong.
    return { ok: false, status: 400, error: 'Send the session cookie, not an Authorization header.' };
  }
  if (!isJwtShape(session)) {
    return { ok: false, status: 401, error: 'Admin session required.' };
  }

  const intent = evaluateWriteIntent({ method, origin, referer, host, csrfCookie, csrfHeader });
  if (!intent.ok) return intent;

  return { ok: true, token: session };
}

/** Which host name a browser would consider "this site", behind a TLS-terminating proxy. */
export const requestHost = ({ host, forwardedHost } = {}) => String(forwardedHost || host || '').split(',')[0].trim().toLowerCase();

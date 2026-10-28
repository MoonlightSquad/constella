import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAdminRequest, evaluateWriteIntent, requestHost } from '../server/utils/admin-guard.mjs';
import { createCsrfToken, csrfMatches } from '../server/utils/csrf.mjs';

// Three base64url segments, the shape the guard accepts before asking the API to verify.
const TOKEN = `${'h'.repeat(12)}.${'p'.repeat(24)}.${'s'.repeat(43)}`;
const CSRF = createCsrfToken();

const base = { method: 'GET', authorization: undefined, session: TOKEN, csrfCookie: CSRF, csrfHeader: CSRF, origin: 'https://constella.pp.ua', referer: undefined, host: 'constella.pp.ua' };
const asPost = (over = {}) => evaluateAdminRequest({ ...base, method: 'POST', ...over });

test('a client-supplied Authorization header is refused outright', () => {
  const decision = evaluateAdminRequest({ ...base, authorization: `Bearer ${TOKEN}` });
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 400);
});

test('a missing, empty or non-JWT cookie is a 401, never a proxy attempt', () => {
  for (const session of [undefined, '', 'hunter2', 'a.b.c', 'eyJhbGciOi|junk']) {
    assert.equal(evaluateAdminRequest({ ...base, session }).ok, false, String(session));
    assert.equal(evaluateAdminRequest({ ...base, session }).status, 401, String(session));
  }
});

test('reads only need the cookie', () => {
  const decision = evaluateAdminRequest(base);
  assert.equal(decision.ok, true);
  assert.equal(decision.token, TOKEN);
});

test('a write without the CSRF echo is rejected even with a valid session', () => {
  assert.equal(asPost({ csrfHeader: undefined }).status, 403);
  assert.equal(asPost({ csrfHeader: '' }).status, 403);
  assert.equal(asPost({ csrfHeader: 'someone-elses-token' }).status, 403);
  assert.equal(asPost({ csrfCookie: '' }).status, 403);
});

test('a cross-site write is rejected even when the cookie is attached', () => {
  // The browser sends cookies for a same-site-looking fetch from another page; the
  // double-submit token is what it cannot read.
  assert.equal(asPost({ origin: 'https://evil.test' }).status, 403);
  assert.equal(asPost({ origin: undefined, referer: 'https://evil.test/admin/posts/1' }).status, 403);
  assert.equal(asPost({ origin: undefined, referer: undefined }).status, 403);
  assert.equal(asPost({ origin: 'null' }).status, 403, 'opaque origin from a sandboxed iframe');
});

test('a same-site write with the matching token passes', () => {
  assert.equal(asPost().ok, true);
  assert.equal(asPost({ origin: undefined, referer: 'https://constella.pp.ua/admin' }).ok, true);
  assert.equal(asPost({ host: 'constella.pp.ua:443' }).ok, true, 'port is not part of the identity');
});

test('header injection tricks cannot forge the host', () => {
  assert.equal(asPost({ host: 'evil.test' }).status, 403);
  assert.equal(asPost({ origin: 'https://constella.pp.ua@evil.test' }).status, 403);
  assert.equal(asPost({ origin: 'https://constella.pp.ua.evil.test' }).status, 403);
});

test('logout is still gated on intent, not on a live session', () => {
  assert.equal(evaluateWriteIntent({ method: 'POST', origin: 'https://evil.test', host: 'constella.pp.ua', csrfCookie: CSRF, csrfHeader: CSRF }).status, 403);
  assert.equal(evaluateWriteIntent({ method: 'POST', origin: 'https://constella.pp.ua', host: 'constella.pp.ua', csrfCookie: CSRF, csrfHeader: undefined }).ok, false);
  assert.equal(evaluateWriteIntent({ method: 'DELETE', origin: 'https://constella.pp.ua', host: 'constella.pp.ua', csrfCookie: CSRF, csrfHeader: CSRF }).ok, true);
  assert.equal(evaluateWriteIntent({ method: 'GET', origin: undefined, host: undefined, csrfCookie: undefined, csrfHeader: undefined }).ok, true);
});

test('the proxy host wins over Host, and a list collapses to the first entry', () => {
  assert.equal(requestHost({ host: 'localhost:5174', forwardedHost: 'constella.pp.ua' }), 'constella.pp.ua');
  assert.equal(requestHost({ host: 'constella.pp.ua' }), 'constella.pp.ua');
  assert.equal(requestHost({ host: 'CONSTELLA.PP.UA' }), 'constella.pp.ua');
  assert.equal(requestHost({ forwardedHost: 'constella.pp.ua, 10.0.0.1' }), 'constella.pp.ua');
});

test('csrf compare is total and constant-time shaped', () => {
  assert.equal(csrfMatches(undefined, CSRF), false);
  assert.equal(csrfMatches(CSRF, undefined), false);
  assert.equal(csrfMatches('', ''), false);
  assert.equal(csrfMatches(CSRF, CSRF), true);
  assert.equal(csrfMatches(`${CSRF}x`, CSRF), false);
  assert.equal(createCsrfToken() !== createCsrfToken(), true);
});

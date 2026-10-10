import assert from 'node:assert/strict';
import test from 'node:test';
import { getApiProxyTarget, resolveApiInternalBase } from '../server/utils/api-proxy-target.mjs';

test('proxies health routes to configured API service', () => assert.equal(getApiProxyTarget('health/live', '', 'http://api:4000'), 'http://api:4000/health/live'));
test('preserves query parameters', () => assert.equal(getApiProxyTarget('auth/web/login', '?next=%2Fapp&mode=web', 'http://api:4000/'), 'http://api:4000/auth/web/login?next=%2Fapp&mode=web'));
test('keeps nested routes under base path', () => assert.equal(getApiProxyTarget('trpc/profile.get', '', 'https://api.example/v1'), 'https://api.example/v1/trpc/profile.get'));
test('rejects empty, traversal, and URL injection paths', () => { for (const path of [undefined, '', '../health/live', 'health/../admin', 'http:evil', 'health?x=1']) assert.equal(getApiProxyTarget(path, '', 'http://api:4000'), null, String(path)); });

test('uses the Compose API service as the production default', () => assert.equal(resolveApiInternalBase({ NODE_ENV: 'production' }), 'http://api:4000'));
test('keeps localhost for development and honors explicit API URLs', () => {
  assert.equal(resolveApiInternalBase({ NODE_ENV: 'development' }), 'http://127.0.0.1:4000');
  assert.equal(resolveApiInternalBase({ NODE_ENV: 'production', NUXT_API_INTERNAL_BASE: 'http://api-internal:4000' }), 'http://api-internal:4000');
  assert.equal(resolveApiInternalBase({ NODE_ENV: 'production', API_PROXY_TARGET: 'https://api-test.constella.pp.ua' }), 'https://api-test.constella.pp.ua');
  assert.equal(resolveApiInternalBase({ NODE_ENV: 'production', NUXT_PUBLIC_API_URL: 'https://api-test.constella.pp.ua' }), 'https://api-test.constella.pp.ua');
});

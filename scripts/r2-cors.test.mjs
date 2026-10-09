import assert from 'node:assert/strict';
import test from 'node:test';
import { configureR2Cors, mergeCorsRules } from './r2-cors-lib.mjs';

const origin = 'https://app-test.constella.pp.ua';

test('adds the required browser upload rule without changing existing rules', () => {
  const existing = [{ id: 'existing', allowed: { origins: ['https://other.example'], methods: ['GET'], headers: [] } }];
  const result = mergeCorsRules(existing, origin);

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], existing[0]);
  assert.deepEqual(result[1], {
    allowed: { origins: [origin], methods: ['PUT', 'GET', 'HEAD'], headers: ['Content-Type'] },
    exposeHeaders: ['ETag'],
    maxAgeSeconds: 3600,
  });
});

test('extends an existing rule for the web origin without duplicating permissions', () => {
  const existing = [{
    id: 'app',
    allowed: { origins: [origin], methods: ['GET'], headers: ['X-Custom'] },
    exposeHeaders: ['X-Request-Id'],
    maxAgeSeconds: 600,
  }];
  const result = mergeCorsRules(existing, origin);

  assert.deepEqual(result, [{
    id: 'app',
    allowed: {
      origins: [origin],
      methods: ['GET', 'PUT', 'HEAD'],
      headers: ['X-Custom', 'Content-Type'],
    },
    exposeHeaders: ['X-Request-Id', 'ETag'],
    maxAgeSeconds: 3600,
  }]);
  assert.deepEqual(existing[0].allowed.methods, ['GET']);
});

test('updates and verifies policy through Cloudflare API', async () => {
  const calls = [];
  let policy = { rules: [] };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (!options.method) return new Response(JSON.stringify({ success: true, result: policy }));
    policy = JSON.parse(options.body);
    return new Response(JSON.stringify({ success: true, result: policy }));
  };

  const result = await configureR2Cors({
    apiToken: 'test-token',
    accountId: 'account-id',
    bucketName: 'constella-media',
    webOrigin: origin,
    fetchImpl,
  });

  assert.deepEqual(result, { changed: true, rulesCount: 1 });
  assert.deepEqual(calls.map(({ options }) => options.method ?? 'GET'), ['GET', 'PUT', 'GET']);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
});

test('does not write a policy that is already configured', async () => {
  const policy = { rules: mergeCorsRules([], origin) };
  const methods = [];
  const result = await configureR2Cors({
    apiToken: 'test-token',
    accountId: 'account-id',
    bucketName: 'constella-media',
    webOrigin: origin,
    fetchImpl: async (_url, options) => {
      methods.push(options.method ?? 'GET');
      return new Response(JSON.stringify({ success: true, result: policy }));
    },
  });

  assert.deepEqual(result, { changed: false, rulesCount: 1 });
  assert.deepEqual(methods, ['GET', 'GET']);
});

test('explains that object-level R2 permission is insufficient', async () => {
  await assert.rejects(
    configureR2Cors({
      apiToken: 'test-token',
      accountId: 'account-id',
      bucketName: 'constella-media',
      webOrigin: origin,
      fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [] }), { status: 403 }),
    }),
    /Workers R2 Storage Write permission; Bucket Item Write only grants object access/,
  );
});

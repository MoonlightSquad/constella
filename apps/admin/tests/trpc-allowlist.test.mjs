import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateTrpcCall, TRPC_PROCEDURES } from '../server/utils/trpc-allowlist.mjs';

test('accepts a plain query and a comma batch of queries', () => {
  assert.deepEqual(evaluateTrpcCall({ method: 'GET', segment: 'admin.overview' }), {
    ok: true,
    names: ['admin.overview'],
    hasMutation: false,
  });

  const batch = evaluateTrpcCall({ method: 'GET', segment: 'admin.users,admin.overview' });
  assert.equal(batch.ok, true);
  assert.equal(batch.names.length, 2);
});

test('refuses a procedure that is not on the list, even next to an allowed one', () => {
  const decision = evaluateTrpcCall({ method: 'GET', segment: 'admin.users,social.sendMessage' });
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 403);
  assert.match(decision.error, /social\.sendMessage/);
});

test('refuses names that are not names', () => {
  for (const segment of ['admin', 'admin.users.delete', '../admin/users', 'admin..users', '', 'ADMIN;USERS']) {
    const decision = evaluateTrpcCall({ method: 'GET', segment });
    assert.equal(decision.ok, false, segment);
  }
});

test('a mutation cannot be reached with a read method', () => {
  const decision = evaluateTrpcCall({ method: 'GET', segment: 'admin.grantVip' });
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 403);
  assert.match(decision.error, /read method/);
});

test('a mutation is allowed on POST and reported as such', () => {
  const decision = evaluateTrpcCall({ method: 'POST', segment: 'admin.grantVip' });
  assert.equal(decision.ok, true);
  assert.equal(decision.hasMutation, true);
});

test('a batch is capped, so one request cannot fan out across the router', () => {
  const names = Array.from({ length: 21 }, () => 'admin.overview').join(',');
  assert.equal(evaluateTrpcCall({ method: 'GET', segment: names }).status, 413);
});

test('only GET and POST reach the upstream', () => {
  assert.equal(evaluateTrpcCall({ method: 'DELETE', segment: 'admin.users' }).status, 405);
});

test('every listed procedure is typed, and the console’s own set is complete', () => {
  for (const [name, kind] of Object.entries(TRPC_PROCEDURES)) {
    assert.match(name, /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/i, name);
    assert.ok(['query', 'mutation'].includes(kind), `${name} -> ${kind}`);
  }
  for (const name of [
    'admin.access', 'admin.admins', 'admin.createAdmin', 'admin.revokeAdmin',
    'admin.overview', 'admin.users', 'admin.reports', 'admin.reviewReport',
    'admin.setUserStatus', 'admin.grantVip', 'admin.photoQueue', 'admin.reviewPhoto',
    'admin.payments', 'admin.audit', 'support.adminQueue', 'support.adminThread', 'support.adminReply',
    'admin.subscription', 'admin.userContent', 'admin.setEntitlement', 'admin.cancelEntitlement',
    'admin.forceLogout', 'admin.updateUserProfile', 'admin.metrics', 'admin.pushRecipients',
    'admin.pushBroadcast',
  ]) {
    assert.ok(Object.hasOwn(TRPC_PROCEDURES, name), `${name} missing from the allowlist`);
  }
});

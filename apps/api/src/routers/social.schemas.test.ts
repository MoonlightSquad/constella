import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasOrbitFilters, orbitFilterSchema, resolveTargetGenders } from './social.schemas.js';

describe('VIP orbit filters', () => {
  it('accepts bounded age, city and gender filters', () => {
    const filters = orbitFilterSchema.parse({ minAge: 25, maxAge: 40, city: '  Kyiv  ', gender: 'woman' });
    assert.deepEqual(filters, { minAge: 25, maxAge: 40, city: 'Kyiv', gender: 'woman' });
    assert.equal(hasOrbitFilters(filters), true);
  });

  it('allows empty filters and rejects invalid ranges and values', () => {
    assert.equal(hasOrbitFilters(orbitFilterSchema.parse({})), false);
    assert.equal(orbitFilterSchema.safeParse({ minAge: 40, maxAge: 25 }).success, false);
    assert.equal(orbitFilterSchema.safeParse({ minAge: 17 }).success, false);
    assert.equal(orbitFilterSchema.safeParse({ city: 'x' }).success, false);
    assert.equal(orbitFilterSchema.safeParse({ gender: 'invalid' }).success, false);
  });
});

describe('resolveTargetGenders', () => {
  it('returns the full preference when no VIP filter is applied', () => {
    assert.deepEqual(resolveTargetGenders(['man', 'nonbinary']), ['man', 'nonbinary']);
    assert.deepEqual(resolveTargetGenders([]), []);
    assert.deepEqual(resolveTargetGenders(null), []);
    assert.deepEqual(resolveTargetGenders(undefined), []);
  });

  it('returns the filter gender regardless of preference when a VIP filter is applied', () => {
    assert.deepEqual(resolveTargetGenders(['man', 'woman'], 'woman'), ['woman']);
    assert.deepEqual(resolveTargetGenders(['man'], 'woman'), ['woman']);
    assert.deepEqual(resolveTargetGenders([], 'man'), ['man']);
    assert.deepEqual(resolveTargetGenders(['woman'], 'man'), ['man']);
  });
});

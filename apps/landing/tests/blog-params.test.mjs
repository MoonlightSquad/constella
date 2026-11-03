import assert from 'node:assert/strict';
import test from 'node:test';
import { pickListParams } from '../server/utils/blog-params.mjs';

const ID = '2f1f9f2c-6d3f-4d7c-8f5f-1c3b5a9d0e11';
const OTHER = '7a2c1d94-8b6e-4f03-9c5d-2e1a6b7f8d90';

test('the list proxy forwards only known, well-formed parameters', () => {
  assert.deepEqual(
    pickListParams({ locale: 'de', category: 'daten', tag: 'tips', limit: 3, cursor: 'abc', exclude: ID, evil: '<script>' }),
    { locale: 'de', category: 'daten', tag: 'tips', exclude: ID, limit: 3, cursor: 'abc' },
  );
  assert.deepEqual(pickListParams({ locale: 'es', category: 'Привіт', tag: '../x', limit: 'x', cursor: 'a'.repeat(300), exclude: 'nope' }), {
    locale: 'uk',
    category: undefined,
    tag: undefined,
    exclude: undefined,
    limit: undefined,
    cursor: undefined,
  });
});

test('limit stays inside the upstream window', () => {
  assert.equal(pickListParams({ limit: 9_000 }).limit, 50);
  assert.equal(pickListParams({ limit: 0 }).limit, 1);
});

test('exclude survives only as a uuid list, because the article block must never be dropped silently', () => {
  assert.equal(pickListParams({ exclude: `${ID}, ${OTHER}` }).exclude, `${ID},${OTHER}`);
  assert.equal(pickListParams({ exclude: `${ID},${'0'.repeat(36)}` }).exclude, ID, 'a junk id must not poison the valid one');
  for (const value of ['', ',', 'https://evil.test', [ID]]) {
    assert.equal(pickListParams({ exclude: value }).exclude, undefined, `${JSON.stringify(value)} was forwarded`);
  }
  // Beyond the upstream window the list is cut, not dropped: an over-long query must still
  // hide the article already on the page rather than repeat it.
  assert.equal(pickListParams({ exclude: Array(12).fill(ID).join(',') }).exclude.split(',').length, 8);
});

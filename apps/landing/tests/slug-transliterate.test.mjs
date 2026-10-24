import assert from 'node:assert/strict';
import test from 'node:test';
import { isSlugShape, slugifyTitle, transliterate } from '../app/utils/slug.mjs';

test('cyrillic titles survive the trip to a URL', () => {
  // The bug this exists for: replace(/[^a-z-]/g, '') turns any Ukrainian title into ''.
  assert.equal(slugifyTitle('Орбіта: вересень 2026'), 'orbita-veresen-2026');
  assert.equal(slugifyTitle('2026 — що змінилось'), '2026-shcho-zminylos');
});

test('digraphs are matched before their own prefix letters', () => {
  assert.equal(transliterate('щука'), 'shchuka');
  assert.equal(transliterate('хвиля'), 'khvylya');
  assert.equal(transliterate('цирка'), 'tsyrka');
  assert.equal(transliterate('жило'), 'zhylo');
});

test('the result always matches the slug the API accepts', () => {
  for (const title of ['', '   ', '!!!', '—', 'й', 'a'.repeat(250), 'Тест — ', 'Є..ї..І']) {
    const slug = slugifyTitle(title);
    assert.ok(isSlugShape(slug), `${JSON.stringify(title)} produced ${JSON.stringify(slug)}`);
  }
});

test('a title without a single transcribable character still gets a slug', () => {
  assert.equal(slugifyTitle('。。。'), 'post');
  assert.equal(slugifyTitle('。。。', 'fallback'), 'fallback');
});

test('length is capped at the API limit and never ends on a dash', () => {
  const slug = slugifyTitle('слово '.repeat(80));
  assert.ok(slug.length <= 200, `got ${slug.length}`);
  assert.ok(!slug.endsWith('-'));
  assert.ok(!slug.includes('--'));
});

test('latin and digits pass through untouched', () => {
  assert.equal(slugifyTitle('VIP 2.0 release'), 'vip-2-0-release');
  assert.equal(slugifyTitle("З'єднання"), 'zyednannya');
});

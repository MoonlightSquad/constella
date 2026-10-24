import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_BODY_CHARACTERS,
  MAX_TAGS,
  createPostSchema,
  decodeCursor,
  encodeCursor,
  estimateReadingMinutes,
  normalizeTags,
  publicListQuerySchema,
  publishStatusSchema,
  updatePostSchema,
} from './schemas.js';

const validPost = {
  locale: 'uk' as const,
  slug: 'bezpeka-znajomstv',
  title: 'Безпека знайомств',
  excerpt: 'Короткий опис.',
  bodyMarkdown: 'Привіт, світ',
};

test('createPostSchema accepts a minimal draft and normalizes tags', () => {
  const parsed = createPostSchema.parse({ ...validPost, tags: ['#Tips', '  Safety  ', 'tips', '', 'x'.repeat(40)] });
  assert.deepEqual(parsed.tags, ['tips', 'safety']);
  assert.equal(parsed.coverUrl, undefined);
});

test('Cyrillic and path-ish slugs are rejected instead of rewritten', () => {
  for (const value of ['привіт', '../etc/passwd', 'has space', '-leading', 'trailing-', 'a'.repeat(201)]) {
    const result = createPostSchema.safeParse({ ...validPost, slug: value });
    assert.equal(result.success, false, `${value} must not parse`);
  }
  assert.equal(createPostSchema.safeParse({ ...validPost, slug: 'a' }).success, true);
  assert.equal(createPostSchema.safeParse({ ...validPost, slug: 'en-2026' }).success, true);
});

test('a cover without alt text is rejected, clearing the cover is allowed', () => {
  assert.equal(createPostSchema.safeParse({ ...validPost, coverUrl: 'https://cdn.test/a.webp' }).success, false);
  assert.equal(createPostSchema.safeParse({ ...validPost, coverUrl: 'https://cdn.test/a.webp', coverAlt: ' ' }).success, false);
  assert.equal(createPostSchema.safeParse({ ...validPost, coverUrl: 'https://cdn.test/a.webp', coverAlt: 'Сузір' }).success, true);
  assert.equal(updatePostSchema.safeParse({ coverUrl: '' }).success, true);
});

test('only absolute http(s) URLs are accepted for media fields', () => {
  for (const value of ['javascript:alert(1)', '/relative/path.png', 'data:image/svg+xml,<svg/>']) {
    assert.equal(createPostSchema.safeParse({ ...validPost, coverUrl: value }).success, false, value);
    assert.equal(createPostSchema.safeParse({ ...validPost, canonicalUrl: value }).success, false, value);
  }
});

test('body length is capped below the Fastify body limit', () => {
  assert.equal(createPostSchema.safeParse({ ...validPost, bodyMarkdown: 'x'.repeat(MAX_BODY_CHARACTERS) }).success, true);
  assert.equal(createPostSchema.safeParse({ ...validPost, bodyMarkdown: 'x'.repeat(MAX_BODY_CHARACTERS + 1) }).success, false);
});

test('locale is fixed after creation', () => {
  assert.equal(updatePostSchema.safeParse({ locale: 'de' }).success, false);
  assert.equal(updatePostSchema.safeParse({}).success, false);
});

test('normalizeTags caps count and length', () => {
  const many = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
  assert.equal(normalizeTags(many).length, MAX_TAGS);
  assert.deepEqual(normalizeTags(['ok', 'x'.repeat(33), 42, null]), ['ok']);
});

test('publishing requires an audit reason', () => {
  assert.equal(publishStatusSchema.safeParse({ status: 'published' }).success, false);
  assert.equal(publishStatusSchema.safeParse({ status: 'published', reason: 'short' }).success, false);
  assert.equal(publishStatusSchema.safeParse({ status: 'published', reason: 'reviewed by editor' }).success, true);
});

test('list query defaults and bounds', () => {
  assert.deepEqual(publicListQuerySchema.parse({}), { locale: 'uk', limit: 10 });
  assert.equal(publicListQuerySchema.safeParse({ locale: 'es' }).success, false);
  assert.equal(publicListQuerySchema.safeParse({ limit: '999' }).success, false);
  assert.equal(publicListQuerySchema.parse({ limit: '25', tag: 'tips' }).limit, 25);
});

test('cursor round-trips and refuses garbage', () => {
  const publishedAt = new Date('2026-03-01T10:00:00.000Z');
  const id = '2f1f9f2c-6d3f-4d7c-8f5f-1c3b5a9d0e11';
  assert.deepEqual(decodeCursor(encodeCursor(publishedAt, id)), { publishedAt, id });
  for (const raw of [
    undefined,
    '',
    '!!!',
    Buffer.from('{}').toString('base64url'),
    Buffer.from(JSON.stringify({ t: 'x', i: id })).toString('base64url'),
    Buffer.from(JSON.stringify({ t: Date.now() })).toString('base64url'),
  ]) {
    assert.equal(decodeCursor(raw), null, String(raw));
  }
  assert.equal(decodeCursor(Buffer.from(JSON.stringify({ t: Date.now(), i: "' or 1=1" })).toString('base64url')), null);
});

test('reading time counts prose, not code fences', () => {
  assert.equal(estimateReadingMinutes(''), 1);
  assert.equal(estimateReadingMinutes('word '.repeat(360)), 2);
  assert.equal(estimateReadingMinutes('```js\n' + 'code '.repeat(10_000) + '\n```'), 1);
  assert.equal(estimateReadingMinutes('word '.repeat(100_000)), 240);
});

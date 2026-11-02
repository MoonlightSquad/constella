import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_BODY_CHARACTERS,
  MAX_CATEGORIES,
  MAX_TAGS,
  createCategorySchema,
  createPostSchema,
  createTagSchema,
  decodeCursor,
  encodeCursor,
  estimateReadingMinutes,
  publicListQuerySchema,
  publishStatusSchema,
  updateCategorySchema,
  updatePostSchema,
} from './schemas.js';

const validPost = {
  locale: 'uk' as const,
  slug: 'bezpeka-znajomstv',
  title: 'Безпека знайомств',
  excerpt: 'Короткий опис.',
  bodyMarkdown: 'Привіт, світ',
};

const validCategory = {
  locale: 'uk' as const,
  slug: 'bezpeka',
  name: 'Безпека',
};

const validTag = {
  locale: 'uk' as const,
  slug: 'dating',
  name: 'Знайомства',
};

test('createPostSchema accepts a minimal draft and id-based taxonomy', () => {
  const id = '2f1f9f2c-6d3f-4d7c-8f5f-1c3b5a9d0e11';
  const parsed = createPostSchema.parse({ ...validPost, categoryIds: [id], tagIds: [id] });
  assert.deepEqual(parsed.categoryIds, [id]);
  assert.equal(parsed.coverUrl, undefined);
});

test('free-text tags are gone from the post schema', () => {
  assert.equal(createPostSchema.safeParse({ ...validPost, tags: ['tips'] }).success, true); // unknown keys are ignored, not persisted
  const parsed = createPostSchema.parse({ ...validPost, tags: ['tips'] });
  assert.equal('tags' in parsed, false);
});

test('category and tag id lists are capped and uuid-only', () => {
  const id = '2f1f9f2c-6d3f-4d7c-8f5f-1c3b5a9d0e11';
  assert.equal(createPostSchema.safeParse({ ...validPost, categoryIds: Array(MAX_CATEGORIES + 1).fill(id) }).success, false);
  assert.equal(createPostSchema.safeParse({ ...validPost, tagIds: Array(MAX_TAGS + 1).fill(id) }).success, false);
  assert.equal(createPostSchema.safeParse({ ...validPost, tagIds: ['not-a-uuid'] }).success, false);
});

test('Cyrillic and path-ish slugs are rejected instead of rewritten', () => {
  for (const value of ['привіт', '../etc/passwd', 'has space', '-leading', 'trailing-', 'a'.repeat(201)]) {
    const result = createPostSchema.safeParse({ ...validPost, slug: value });
    assert.equal(result.success, false, `${value} must not parse`);
  }
  assert.equal(createPostSchema.safeParse({ ...validPost, slug: 'a' }).success, true);
  assert.equal(createPostSchema.safeParse({ ...validPost, slug: 'en-2026' }).success, true);
});

test('taxonomy archive segments are reserved post slugs', () => {
  for (const value of ['category', 'tag']) {
    assert.equal(createPostSchema.safeParse({ ...validPost, slug: value }).success, false, `${value} must not parse`);
    assert.equal(updatePostSchema.safeParse({ slug: value }).success, false);
  }
  // Categories live in their own URL namespace, so they keep those slugs for themselves.
  assert.equal(createCategorySchema.safeParse({ ...validCategory, slug: 'category' }).success, true);
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

test('createCategorySchema keeps translations distinct from the primary locale', () => {
  assert.equal(createCategorySchema.safeParse(validCategory).success, true);
  assert.equal(createCategorySchema.safeParse({ ...validCategory, name: '' }).success, false);
  assert.equal(
    createCategorySchema.safeParse({ ...validCategory, translations: [{ locale: 'en', slug: 'safety', name: 'Safety' }] }).success,
    true,
  );
  assert.equal(
    createCategorySchema.safeParse({ ...validCategory, translations: [{ locale: 'uk', slug: 'safety', name: 'Safety' }] }).success,
    false,
    'primary locale must not repeat',
  );
  assert.equal(
    createCategorySchema.safeParse({
      ...validCategory,
      translations: [
        { locale: 'de', slug: 'sicherheit', name: 'Sicherheit' },
        { locale: 'de', slug: 'schutz', name: 'Schutz' },
      ],
    }).success,
    false,
    'duplicate extra locale must be rejected',
  );
});

test('createTagSchema caps names at the tag length', () => {
  assert.equal(createTagSchema.safeParse(validTag).success, true);
  assert.equal(createTagSchema.safeParse({ ...validTag, name: 'x'.repeat(33) }).success, false);
  assert.equal(createTagSchema.safeParse({ ...validTag, description: 'теґи не мають опису' }).success, true); // unknown keys ignored
});

test('updateCategorySchema demands at least one locale change and no duplicates', () => {
  assert.equal(updateCategorySchema.safeParse({}).success, false);
  assert.equal(updateCategorySchema.safeParse({ translations: [] }).success, false);
  assert.equal(updateCategorySchema.safeParse({ translations: [{ locale: 'de', slug: 'sicherheit', name: 'Sicherheit' }] }).success, true);
  assert.equal(updateCategorySchema.safeParse({ translations: [{ locale: 'de' }] }).success, true, 'existing locale may patch a subset');
  assert.equal(updateCategorySchema.safeParse({ removeLocales: ['fr'] }).success, true);
  assert.equal(updateCategorySchema.safeParse({ removeLocales: ['es'] }).success, false);
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
  assert.equal(publicListQuerySchema.parse({ limit: '25', tag: 'tips', category: 'sicherheit' }).limit, 25);
  assert.equal(publicListQuerySchema.safeParse({ tag: 'Привіт' }).success, false, 'tag filter must be an ASCII slug');
  assert.equal(publicListQuerySchema.safeParse({ category: '../x' }).success, false);
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

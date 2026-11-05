import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_BODY_CHARACTERS,
  MAX_CATEGORIES,
  MAX_SAME_AS,
  MAX_TAGS,
  adminListQuerySchema,
  createAuthorSchema,
  createCategorySchema,
  createPostSchema,
  createTagSchema,
  decodeCursor,
  encodeCursor,
  estimateReadingMinutes,
  likePattern,
  publicListQuerySchema,
  publishStatusSchema,
  updateAuthorSchema,
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

// Плейсхолдер, а не вигадана людина: тесту потрібні лише межі полів.
const validAuthor = {
  locale: 'uk' as const,
  slug: 'redaktorka',
  name: 'Редакторка',
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
  for (const value of ['category', 'tag', 'author']) {
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

test('a pinned article is a group id, and a pin-only patch is a change', () => {
  const id = '2f1f9f2c-6d3f-4d7c-8f5f-1c3b5a9d0e11';
  assert.equal(createCategorySchema.safeParse({ ...validCategory, pinnedPostGroupId: id }).success, true);
  assert.equal(createCategorySchema.safeParse({ ...validCategory, pinnedPostGroupId: 'znaiomstva' }).success, false, 'a slug is not an id');
  assert.equal(createCategorySchema.safeParse({ ...validCategory, pinnedPostGroupId: '../x' }).success, false);
  assert.equal(updateCategorySchema.safeParse({ pinnedPostGroupId: id }).success, true, 'the editor saves the pin without touching translations');
  assert.equal(updateCategorySchema.safeParse({ pinnedPostGroupId: '' }).success, true, 'an empty string clears it');
  assert.equal(updateCategorySchema.safeParse({ pinnedPostGroupId: 'nope' }).success, false);
});

test('the admin post list filters by category id', () => {
  const id = '2f1f9f2c-6d3f-4d7c-8f5f-1c3b5a9d0e11';
  assert.equal(adminListQuerySchema.parse({ category: id }).category, id);
  assert.equal(adminListQuerySchema.parse({}).category, undefined);
  for (const value of ['znaiomstva', 'nope', '']) {
    assert.equal(adminListQuerySchema.safeParse({ category: value }).success, false, `"${value}" was accepted`);
  }
});

test('createAuthorSchema keeps the category rules and adds the person fields', () => {
  assert.equal(createAuthorSchema.safeParse(validAuthor).success, true);
  assert.equal(createAuthorSchema.safeParse({ ...validAuthor, name: '' }).success, false);
  assert.equal(
    createAuthorSchema.safeParse({ ...validAuthor, translations: [{ locale: 'en', slug: 'editor', name: 'Editor' }] }).success,
    true,
  );
  assert.equal(
    createAuthorSchema.safeParse({ ...validAuthor, translations: [{ locale: 'uk', slug: 'editor', name: 'Editor' }] }).success,
    false,
    'primary locale must not repeat',
  );
  // Портрет без опису — це alt-текст порожній і в Telegram-превʼю, і в скрінрідері.
  assert.equal(createAuthorSchema.safeParse({ ...validAuthor, avatarUrl: 'https://cdn.test/a.webp' }).success, false);
  assert.equal(createAuthorSchema.safeParse({ ...validAuthor, avatarUrl: 'https://cdn.test/a.webp', avatarAlt: ' ' }).success, false);
  assert.equal(createAuthorSchema.safeParse({ ...validAuthor, avatarUrl: 'https://cdn.test/a.webp', avatarAlt: 'Портрет' }).success, true);
  assert.equal(createAuthorSchema.safeParse({ ...validAuthor, avatarUrl: '' }).success, true);
});

test('sameAs accepts profile URLs only and is capped', () => {
  assert.equal(createAuthorSchema.safeParse({ ...validAuthor, sameAs: ['https://t.me/constella'] }).success, true);
  for (const value of ['t.me/constella', 'javascript:alert(1)']) {
    assert.equal(createAuthorSchema.safeParse({ ...validAuthor, sameAs: [value] }).success, false, value);
  }
  const many = Array.from({ length: MAX_SAME_AS + 1 }, (_, index) => `https://t.me/a${index}`);
  assert.equal(createAuthorSchema.safeParse({ ...validAuthor, sameAs: many }).success, false);
});

test('updateAuthorSchema lets an avatar-only patch through', () => {
  assert.equal(updateAuthorSchema.safeParse({}).success, false);
  assert.equal(updateAuthorSchema.safeParse({ avatarAlt: 'Портрет' }).success, true, 'the editor saves the photo without touching translations');
  assert.equal(updateAuthorSchema.safeParse({ avatarUrl: '' }).success, true, 'an empty string clears it');
  assert.equal(updateAuthorSchema.safeParse({ avatarUrl: 'https://cdn.test/a.webp' }).success, false, 'avatarAlt is still required');
  assert.equal(
    updateAuthorSchema.safeParse({ translations: [{ locale: 'de' }, { locale: 'de' }] }).success,
    false,
    'duplicate locale must be rejected',
  );
});

test('an author is a slug publicly, an id in the admin and both on the post row', () => {
  const id = '2f1f9f2c-6d3f-4d7c-8f5f-1c3b5a9d0e11';
  assert.equal(publicListQuerySchema.parse({ author: 'redaktorka' }).author, 'redaktorka');
  assert.equal(publicListQuerySchema.safeParse({ author: 'has space' }).success, false);
  assert.equal(adminListQuerySchema.parse({ author: id }).author, id);
  assert.equal(adminListQuerySchema.safeParse({ author: 'redaktorka' }).success, false);
  assert.equal(createPostSchema.safeParse({ ...validPost, authorId: id }).success, true);
  assert.equal(createPostSchema.safeParse({ ...validPost, authorId: '' }).success, true, 'an empty string drops the signature');
  assert.equal(createPostSchema.safeParse({ ...validPost, authorId: 'redaktorka' }).success, false);
});

test('publishing requires an audit reason and accepts an optional publication time', () => {
  assert.equal(publishStatusSchema.safeParse({ status: 'published' }).success, false);
  assert.equal(publishStatusSchema.safeParse({ status: 'published', reason: 'short' }).success, false);
  assert.equal(publishStatusSchema.safeParse({ status: 'published', reason: 'reviewed by editor' }).success, true);
  assert.equal(
    publishStatusSchema.safeParse({ status: 'published', reason: 'reviewed by editor', publishedAt: '2026-03-01T10:00' }).success,
    true,
  );
  assert.equal(
    publishStatusSchema.safeParse({ status: 'published', reason: 'reviewed by editor', publishedAt: 'not-a-date' }).success,
    false,
  );
});

test('list query defaults and bounds', () => {
  assert.deepEqual(publicListQuerySchema.parse({}), { locale: 'uk', limit: 10 });
  assert.equal(publicListQuerySchema.safeParse({ locale: 'es' }).success, false);
  assert.equal(publicListQuerySchema.safeParse({ limit: '999' }).success, false);
  assert.equal(publicListQuerySchema.parse({ limit: '25', tag: 'tips', category: 'sicherheit' }).limit, 25);
  assert.equal(publicListQuerySchema.safeParse({ tag: 'Привіт' }).success, false, 'tag filter must be an ASCII slug');
  assert.equal(publicListQuerySchema.safeParse({ category: '../x' }).success, false);
});

test('search is a trimmed phrase of two to eighty characters', () => {
  assert.equal(publicListQuerySchema.parse({ search: '  безпека  ' }).search, 'безпека', 'the field is trimmed before it reaches the pattern');
  assert.equal(publicListQuerySchema.safeParse({ search: 'x' }).success, false, 'one letter would match half the archive and look broken');
  assert.equal(publicListQuerySchema.safeParse({ search: '  ' }).success, false, 'padding is not a query');
  assert.equal(publicListQuerySchema.safeParse({ search: 'x'.repeat(81) }).success, false);
  assert.equal(publicListQuerySchema.parse({}).search, undefined);
});

test('likePattern quotes the wildcards instead of honouring them', () => {
  assert.equal(likePattern('безпека'), '%безпека%');
  assert.equal(likePattern('  100%Match  '), '%100\\%Match%');
  assert.equal(likePattern('cat_x'), '%cat\\_x%', 'an underscore must not stand for any character');
  assert.equal(likePattern('a\\b'), '%a\\\\b%', 'the escape character escapes itself, first and once');
  assert.equal(likePattern('%'), '%\\%%', 'a lone wildcard stays a literal, not a match-everything');
});

test('exclude splits a csv of group ids and nothing else', () => {
  const id = '2f1f9f2c-6d3f-4d7c-8f5f-1c3b5a9d0e11';
  assert.deepEqual(publicListQuerySchema.parse({ exclude: ` ${id} ,${id}` }).exclude, [id, id]);
  assert.equal(publicListQuerySchema.parse({ exclude: id }).exclude?.length, 1);
  for (const value of ['', ' ', `${id},${id},${id},${id},${id},${id},${id},${id},${id}`, 'not-a-uuid', id.slice(1)]) {
    assert.equal(publicListQuerySchema.safeParse({ exclude: value }).success, false, `"${value}" was accepted`);
  }
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

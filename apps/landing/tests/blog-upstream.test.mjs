import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { blogUpstreamUrl, resolveApiInternalSource } from '../server/utils/api-base.mjs';
import { blogArchivePath, blogIndexPath, blogPath, buildRss, escapeXml } from '../server/utils/feed.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('upstream base prefers request-time env over the build-time config', () => {
  assert.deepEqual(
    resolveApiInternalSource({ NUXT_API_INTERNAL_BASE: 'http://a', API_INTERNAL_URL: 'http://b' }, 'http://c'),
    { base: 'http://a', source: 'NUXT_API_INTERNAL_BASE' },
  );
  assert.deepEqual(resolveApiInternalSource({ API_INTERNAL_URL: 'http://b/' }, 'http://c'), { base: 'http://b', source: 'API_INTERNAL_URL' });
  assert.deepEqual(resolveApiInternalSource({}, 'http://c'), { base: 'http://c', source: 'runtimeConfig (build-time)' });
  // A trailing slash would double up in the joined URL, so it never survives resolution.
  assert.equal(resolveApiInternalSource({ NUXT_API_INTERNAL_BASE: 'http://a///' }, '').base, 'http://a');
  assert.equal(resolveApiInternalSource({ NODE_ENV: 'production' }, '').base, 'http://api:4000');
  assert.equal(resolveApiInternalSource({}, '').base, 'http://127.0.0.1:4000');
});

test('the slug is a path segment, not a query parameter', () => {
  // `/blog/post?slug=x` was fetched instead of `/blog/posts/x`, so every article 404-ed.
  assert.equal(
    blogUpstreamUrl('http://api:4000', 'post', { slug: 'орбіта', locale: 'uk' }),
    'http://api:4000/blog/posts/%D0%BE%D1%80%D0%B1%D1%96%D1%82%D0%B0?locale=uk',
  );
  assert.equal(blogUpstreamUrl('http://api:4000', 'posts', { locale: 'de', tag: 'nebo', limit: 20 }), 'http://api:4000/blog/posts?locale=de&tag=nebo&limit=20');
  assert.equal(blogUpstreamUrl('http://api:4000/', 'tags', { locale: 'uk' }), 'http://api:4000/blog/tags?locale=uk');
});

test('taxonomy routes keep their fixed Latin segments', () => {
  // `/blog/category/<slug>` і `/blog/tag/<slug>` — терміновий slug локалізований, сегмент — ні.
  assert.equal(blogUpstreamUrl('http://api:4000', 'category', { slug: 'product-news', locale: 'de' }), 'http://api:4000/blog/categories/product-news?locale=de');
  assert.equal(blogUpstreamUrl('http://api:4000', 'tag', { slug: 'nebo', locale: 'uk' }), 'http://api:4000/blog/tags/nebo?locale=uk');
  assert.equal(blogUpstreamUrl('http://api:4000', 'categories', { locale: 'fr' }), 'http://api:4000/blog/categories?locale=fr');
  // Профіль — одна мовна сутність: апстрим plural (`/blog/authors/:slug`), як категорії з тегами.
  assert.equal(blogUpstreamUrl('http://api:4000', 'author', { slug: 'redaktorka', locale: 'de' }), 'http://api:4000/blog/authors/redaktorka?locale=de');
  assert.equal(blogUpstreamUrl('http://api:4000', 'sitemapTaxonomy', {}), 'http://api:4000/blog/sitemap/taxonomy');
  assert.throws(() => blogUpstreamUrl('http://api:4000', 'unknown-route', {}), /Unknown blog route/);
});

test('uk is unprefixed, the rest of the locales are', () => {
  assert.equal(blogIndexPath('uk'), '/blog');
  assert.equal(blogPath('uk', 'х'), '/blog/х');
  assert.equal(blogPath('fr', 'x'), '/fr/blog/x');
  assert.equal(blogArchivePath('category', 'uk', 'news'), '/blog/category/news');
  assert.equal(blogArchivePath('tag', 'fr', 'x'), '/fr/blog/tag/x');
  assert.equal(blogArchivePath('author', 'uk', 'redaktorka'), '/blog/author/redaktorka');
});

test('empty and missing params are not forwarded as junk', () => {
  const url = blogUpstreamUrl('http://api:4000', 'posts', { locale: 'uk', tag: undefined, cursor: '', limit: null });
  assert.equal(url, 'http://api:4000/blog/posts?locale=uk');
});

test('xml metacharacters in post titles cannot break out of the element', () => {
  assert.equal(escapeXml(`A&B <tag> "q" 's'`), 'A&amp;B &lt;tag&gt; &quot;q&quot; &apos;s&apos;');
  const xml = buildRss({
    locale: 'uk',
    language: 'uk-UA',
    siteUrl: 'https://constella.pp.ua',
    title: 'Блог <Constella>',
    description: 'A & B',
    items: [{ slug: 'x', title: '<script>alert(1)</script>', excerpt: '&', authorName: "O'Henry", publishedAt: '2026-09-15T09:00:00Z' }],
  });
  assert.ok(!/<script/.test(xml), xml);
  assert.match(xml, /&lt;script&gt;/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/constella.pp.ua\/blog\/x<\/guid>/);
  assert.match(xml, /<pubDate>Tue, 15 Sep 2026 09:00:00 GMT<\/pubDate>/);
});

test('an undated post is still a valid item', () => {
  const xml = buildRss({ locale: 'en', language: 'en-US', siteUrl: 'https://constella.pp.ua', title: 't', description: 'd', items: [{ slug: 'x', title: 't', excerpt: 'e', authorName: 'a', publishedAt: null }] });
  assert.ok(!xml.includes('<pubDate>'), xml);
  assert.match(xml, /<link>https:\/\/constella.pp.ua\/en\/blog\/x<\/link>/);
});

/**
 * `<language>`-успадкоємець для HTTP: тип відповіді — те, чим читалка вирішує, як парсити
 * тіло, тому `application/rss+xml; charset=utf-8` прописаний у роуті, а не дістався з навмання.
 * Друга половина — та сама пастка, що в списку статей: фолбек `{ items: [] }` на відмові бази
 * видавав би валідний і повністю порожній канал, який край тримає десять хвилин.
 */
test('the feed names its media type and refuses to pose as an empty channel', () => {
  const source = readFileSync(join(root, 'server', 'routes', 'feed', '[locale].xml.get.ts'), 'utf8');
  assert.match(source, /setHeader\(event, 'content-type', 'application\/rss\+xml; charset=utf-8'\)/);
  assert.ok(!/\bfetchBlogOr\s*(<|\()/.test(source), 'an unreachable upstream must not become zero items');
  assert.match(source, /try \{[\s\S]*?fetchBlog</, 'a refused connection is caught, not surfaced as a generic 500');
  assert.match(source, /statusCode: 502/);
});

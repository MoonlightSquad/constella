import assert from 'node:assert/strict';
import test from 'node:test';
import { blogUpstreamUrl, resolveApiInternalSource } from '../server/utils/api-base.mjs';
import { blogIndexPath, blogPath, buildRss, escapeXml } from '../server/utils/feed.mjs';

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

test('empty and missing params are not forwarded as junk', () => {
  const url = blogUpstreamUrl('http://api:4000', 'posts', { locale: 'uk', tag: undefined, cursor: '', limit: null });
  assert.equal(url, 'http://api:4000/blog/posts?locale=uk');
});

test('uk is unprefixed, the rest of the locales are', () => {
  assert.equal(blogIndexPath('uk'), '/blog');
  assert.equal(blogPath('uk', 'х'), '/blog/х');
  assert.equal(blogPath('fr', 'x'), '/fr/blog/x');
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

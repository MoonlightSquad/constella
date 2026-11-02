import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown, renderMarkdownWithToc } from '../server/utils/blog-markdown.mjs';

const FUNNEL = 'https://app.constella.pp.ua';
const utm = { medium: 'article', campaign: 'bezpeka-znakomstv' };
const body = (source) => renderMarkdownWithToc(source, utm).html;
// Attribute values come back HTML-escaped; the browser resolves them before parsing the URL.
const hrefOf = (html) => /<a href="([^"]+)"/.exec(html)?.[1].replaceAll('&amp;', '&');

test('funnel links carry the article campaign', () => {
  const url = new URL(hrefOf(body(`[почати](${FUNNEL}/start)`)));
  assert.equal(url.searchParams.get('utm_source'), 'blog');
  assert.equal(url.searchParams.get('utm_medium'), 'article');
  assert.equal(url.searchParams.get('utm_campaign'), utm.campaign);
});

test('tagging is idempotent and keeps an author’s own campaign', () => {
  const written = `${FUNNEL}/?utm_source=newsletter&utm_campaign=manual`;
  assert.equal(hrefOf(body(`[x](${written})`)), written);
});

test('query params land before any hash', () => {
  assert.match(hrefOf(body(`[x](${FUNNEL}/pricing#vip)`)), /\?utm_source=blog.*#vip$/);
});

test('third-party links and path-less hosts keep their own meaning', () => {
  const hostOnly = hrefOf(body('[x](https://app.constella.pp.ua.evil.test)'));
  assert.ok(!hostOnly.includes('utm_source'), hostOnly);
  assert.match(body('[x](https://example.com)'), /rel="nofollow noopener noreferrer"/);
});

test('non-http hrefs are not rewritten', () => {
  for (const href of ['#rozdil', 'mailto:hi@constella.pp.ua', '/blog']) {
    assert.ok(!hrefOf(body(`[x](${href})`)).includes('utm_'), href);
  }
});

test('rendering without an utm leaves the href untouched', () => {
  assert.equal(hrefOf(renderMarkdown(`[x](${FUNNEL}/start)`)), `${FUNNEL}/start`);
});

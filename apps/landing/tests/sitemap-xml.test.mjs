import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildSitemapXml, postSitemapEntries, staticSitemapEntries, taxonomySitemapEntries } from '../server/utils/sitemap.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://constella.pp.ua';

const locs = (xml) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
const urlBlocks = (xml) => xml.split('<url>').slice(1).map((chunk) => chunk.split('</url>')[0]);

test('the file is a single urlset with the prolog the format asks for', () => {
  const xml = buildSitemapXml(SITE, staticSitemapEntries());
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), xml.slice(0, 120));
  assert.match(xml, /<\/urlset>\s*$/);
  // Ніякого stylesheet PI: Chrome і так більше не застосовує XSLT у своєму XML-переглядачі,
  // а «may not display correctly» на кожному відкритті — ціна, яку ніхто не платить.
  assert.ok(!xml.includes('xml-stylesheet'));
});

test('the static pages carry one entry per locale with a complete cluster', () => {
  const xml = buildSitemapXml(SITE, staticSitemapEntries());
  const listed = locs(xml);
  assert.equal(listed.length, 24, 'home, /blog, three legal pages and security page in four languages');
  assert.deepEqual(listed.filter((loc) => !loc.startsWith(`${SITE}/`)), [], 'every loc is absolute on the canonical host');
  for (const block of urlBlocks(xml)) {
    const links = [...block.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)];
    assert.equal(links.length, 5, 'four languages plus x-default, including the page itself');
    assert.equal(links.filter(([, hreflang]) => hreflang === 'x-default').length, 1);
  }
  assert.ok(listed.includes(`${SITE}/`), 'the Ukrainian root stays unprefixed, as the i18n strategy promises');
  assert.ok(listed.includes(`${SITE}/de/legal/terms`));
  assert.ok(listed.includes(`${SITE}/security`));
  assert.ok(listed.includes(`${SITE}/en/security`));
  assert.ok(listed.includes(`${SITE}/de/security`));
  assert.ok(listed.includes(`${SITE}/fr/security`));
});

/**
 * hreflang — одне джерело правди на весь сайт: те, що `nuxt.config.ts` віддає `@nuxtjs/i18n`
 * для `<link hreflang>` в HTML, має збігатися з тим, що пише sitemap. Роз'їзд робить кластер
 * недійсним, а помітити його можна тільки в Search Console.
 */
test('the sitemap hreflang tags are the ones the i18n config declares', () => {
  const config = readFileSync(join(root, 'nuxt.config.ts'), 'utf8');
  const declared = [...config.matchAll(/code: '(\w+)', language: '([\w-]+)'/g)].map((match) => [match[1], match[2]]);
  assert.equal(declared.length, 4, 'expected four locales in the i18n config');
  const xml = buildSitemapXml(SITE, staticSitemapEntries());
  const emitted = new Set([...xml.matchAll(/hreflang="([^"]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...emitted].sort(), [...declared.map(([, language]) => language), 'x-default'].sort());
});

test('articles report their own revision date and their siblings as alternates', () => {
  const entries = postSitemapEntries([
    { groupId: 'g1', locale: 'uk', slug: 'bezpeka-znakomstv', updatedAt: '2026-11-01T09:00:00.000Z' },
    { groupId: 'g1', locale: 'de', slug: 'sicherheit-beim-dating', updatedAt: '2026-10-28T09:00:00.000Z' },
  ]);
  assert.equal(entries.length, 2);
  const xml = buildSitemapXml(SITE, entries);
  assert.deepEqual(locs(xml), [`${SITE}/blog/bezpeka-znakomstv`, `${SITE}/de/blog/sicherheit-beim-dating`]);
  assert.match(xml, /<lastmod>2026-11-01T09:00:00\.000Z<\/lastmod>/);
  assert.match(xml, /<lastmod>2026-10-28T09:00:00\.000Z<\/lastmod>/, 'a translated article is edited on its own schedule');
  const cluster = urlBlocks(xml)[0];
  assert.equal([...cluster.matchAll(/href="([^"]+)"/g)].length, 3, 'x-default plus both locales');
  assert.ok(cluster.includes('hreflang="de-DE"'));
});

test('taxonomy archives without an edit date emit no lastmod at all', () => {
  const entries = taxonomySitemapEntries({
    categories: [{ id: 'c1', locale: 'uk', slug: 'beyzpeka' }],
    tags: [],
    authors: [{ id: 'a1', locale: 'uk', slug: 'volodymyr-semerenko' }],
  });
  const xml = buildSitemapXml(SITE, entries);
  assert.ok(!xml.includes('<lastmod>'), 'an absent date must not become a fabricated one');
  assert.deepEqual(locs(xml), [`${SITE}/blog/category/beyzpeka`, `${SITE}/blog/author/volodymyr-semerenko`]);
});

test('a slug or a host with XML metacharacters cannot break the document', () => {
  const xml = buildSitemapXml('https://e.test/a&b', [
    { loc: '/blog/<script>', alternatives: [{ hreflang: 'x-"<default', href: '/blog/&amp' }] },
  ]);
  assert.ok(xml.includes(`<loc>https://e.test/a&amp;b/blog/&lt;script&gt;</loc>`), xml);
  assert.ok(xml.includes('hreflang="x-&quot;&lt;default"'), xml);
  assert.equal((xml.match(/<loc>/g) ?? []).length, 1);
});

/**
 * Тип відповіді — те, заради чого роут і написаний: модуль ставив його всередині себе,
 * і жодне `routeRules` з тим не справлялось.
 */
test('the route names the media type in its own code', () => {
  const source = readFileSync(join(root, 'server', 'routes', 'sitemap.xml.get.ts'), 'utf8');
  assert.match(source, /setHeader\(event, 'content-type', 'application\/xml; charset=utf-8'\)/);
  assert.match(source, /'no-store'/, 'a failed rebuild must never be served from cache');
});

/**
 * Нею доступний, але відмовний апстрим відрізняється від недоступного: `fetchBlog` другий
 * зійняє, а не повертає `data: null`. Без `try` краулер отримав би 500 від Nitro — без
 * `retry-after` і з HTML-сторінкою помилки замість ліків.
 */
test('an unreachable upstream is caught, not propagated as a generic 500', () => {
  const source = readFileSync(join(root, 'server', 'routes', 'sitemap.xml.get.ts'), 'utf8');
  assert.match(source, /try \{[\s\S]*?Promise\.all\([\s\S]*?fetchBlog[\s\S]*?\}\s*catch/, 'the reads must sit inside a try/catch');
  assert.match(source, /if \(!posts\?\.data\?\.items \|\| !taxonomy\?\.data\)/, 'the guard must survive the catch, with optional chaining');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { headingSlug, markdownExcerpt, renderMarkdown } from '../server/utils/blog-markdown.mjs';

test('raw HTML in a post body is escaped, not executed', () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://evil.test"></iframe>');
  assert.ok(!html.includes('<script'), 'no script element');
  assert.ok(!html.includes('<img'), 'no img element');
  assert.ok(!html.includes('<iframe'), 'no iframe element');
  assert.ok(html.includes('&lt;script&gt;'), 'the source is visible as text');
  assert.ok(!/<[a-z][^>]*\son\w+=/i.test(html), 'no element carries an event handler');
});

test('dangerous link protocols are dropped', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox']) {
    const html = renderMarkdown(`[x](${href})`);
    assert.ok(!html.includes('<a'), `${href} produced a link: ${html}`);
  }
  assert.match(renderMarkdown('[ok](https://example.com)'), /<a href="https:\/\/example.com"/);
});

test('headings get stable ids for the table of contents', () => {
  assert.equal(headingSlug('  2026 — що змінилось '), '2026-що-змінилось');
  assert.equal(headingSlug('!!!'), 'section');
  const html = renderMarkdown('## Привіт, **світ**!');
  assert.match(html, /<h2 id="привіт-світ">/);
});

test('external links are nofollowed and images are lazy', () => {
  const html = renderMarkdown('[site](https://example.com) ![сузір’я](/cover.webp)');
  assert.match(html, /rel="nofollow noopener noreferrer"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
  assert.match(html, /alt="сузір’я"/, 'alt text is preserved');
});

test('in-page anchors are left alone', () => {
  const html = renderMarkdown('[розділ](#pricing)');
  assert.ok(!html.includes('nofollow'), html);
});

test('authoring conveniences work', () => {
  const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n~~x~~\n\n- list\n\n```js\nconst a = 1;\n```\n');
  assert.match(html, /<table>/);
  assert.match(html, /<s>x<\/s>/);
  assert.match(html, /<pre><code class="language-js">/);
  assert.match(html, /<ul>/);
});

test('excerpt falls back to plain text without markdown noise', () => {
  assert.equal(markdownExcerpt('# Title\n\nSome **bold** text [link](https://x.y).'), 'Title Some bold text link.');
  const long = markdownExcerpt('word '.repeat(100), 40);
  assert.ok(long.length <= 42, `got ${long.length}`);
  assert.ok(long.endsWith('…'));
  assert.equal(markdownExcerpt('```\ncode\n```\n'), '');
});

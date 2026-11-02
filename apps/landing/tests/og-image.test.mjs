import assert from 'node:assert/strict';
import test from 'node:test';
import { brandMark, clampText, h, ogCard, OG_KINDS, parseOgQuery, titleSize } from '../server/utils/og-image.mjs';

const walk = (node, visit) => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  const children = node.props?.children;
  if (Array.isArray(children)) children.forEach((child) => walk(child, visit));
  else if (children && typeof children === 'object') walk(children, visit);
};

const textOf = (node) => {
  const found = [];
  walk(node, (item) => {
    const children = item.props?.children;
    if (typeof children === 'string') found.push(children);
  });
  return found;
};

test('only the cards we generate are renderable', () => {
  assert.deepEqual(parseOgQuery({ kind: 'post', slug: 'yak-shukaty', locale: 'de' }), { ok: true, kind: 'post', slug: 'yak-shukaty', locale: 'de' });
  // A missing locale is the site default, never a fifth language.
  assert.equal(parseOgQuery({ kind: 'tag', slug: 'nebo' }).locale, 'uk');
  assert.equal(parseOgQuery({ kind: 'tag', slug: 'nebo', locale: 'pl' }).locale, 'uk');
  assert.deepEqual(parseOgQuery({ kind: 'shop', slug: 'nebo' }), { ok: false, reason: 'kind' });
  assert.deepEqual(parseOgQuery({ slug: 'nebo' }), { ok: false, reason: 'kind' });
  for (const slug of ['', 'Nebo', 'ne bo', 'nebo/', '../etc/passwd', 'x'.repeat(201)]) {
    assert.deepEqual(parseOgQuery({ kind: 'post', slug }), { ok: false, reason: 'slug' }, slug);
  }
  assert.equal(parseOgQuery({ kind: 'post', slug: 'x'.repeat(200) }).ok, true);
  // Every kind the pages are allowed to ask for must survive the allowlist.
  for (const kind of OG_KINDS) assert.equal(parseOgQuery({ kind, slug: 'a' }).kind, kind);
});

test('text is cut on a budget, and on a word where one fits', () => {
  assert.equal(clampText('  Короткий   заголовок  ', 40), 'Короткий заголовок');
  assert.equal(clampText('abcdef', 10), 'abcdef');
  assert.equal(clampText('a'.repeat(140), 140), 'a'.repeat(140));
  assert.equal(clampText(null, 20), '');
  assert.equal(clampText(undefined, 20), '');

  const long = clampText('word '.repeat(60), 24);
  assert.ok(long.length <= 24);
  assert.ok(long.endsWith('…'));
  assert.equal(long, 'word word word word…');

  // An unbroken run has no word to land on, so it still uses the whole budget.
  assert.equal(clampText('x'.repeat(400), 140).length, 140);
});

test('longer titles get a smaller face so they stay on the card', () => {
  assert.ok(titleSize('a'.repeat(20)) > titleSize('a'.repeat(50)));
  assert.ok(titleSize('a'.repeat(50)) > titleSize('a'.repeat(70)));
  assert.ok(titleSize('a'.repeat(70)) > titleSize('a'.repeat(95)));
});

test('a childless element carries no children prop', () => {
  // satori rejects `<div children={[]}>` with "expected ... to have explicit display: flex",
  // so the empty case has to look like a text node's parent, not like an empty list.
  assert.deepEqual(h('div', { style: { width: 4 } }), { type: 'div', props: { style: { width: 4 } } });
  assert.deepEqual(h('div', {}, 'a').props.children, 'a');
  assert.equal(h('div', {}, 'a', 'b').props.children.length, 2);
});

test('every node with several children declares flex', () => {
  // The one satori rule that cannot be discovered by reading the markup: a div with more than
  // one child and no `display` throws at render time, which the route would swallow as a redirect.
  for (const card of [
    ogCard({ title: 'Тест', eyebrow: 'Категорія', footer: 'Автор · 2 листопада' }),
    ogCard({ title: 'Тест' }),
    brandMark(64),
  ]) {
    walk(card, (node) => {
      const children = node.props?.children;
      if (!Array.isArray(children)) return;
      assert.notEqual(children.length, 0, 'empty children array');
      if (children.length > 1) {
        assert.ok(['flex', 'contents', 'none'].includes(node.props.style?.display), `<${node.type}> with ${children.length} children needs display`);
      }
    });
  }
});

test('the card keeps the copy inside its budgets', () => {
  const texts = textOf(ogCard({ title: 'x'.repeat(400), eyebrow: 'y'.repeat(200), footer: 'z'.repeat(300) }));
  assert.equal(texts.find((text) => text.startsWith('y'))?.length, 60);
  assert.equal(texts.find((text) => text.startsWith('x'))?.length, 140);
  assert.equal(texts.find((text) => text.startsWith('z'))?.length, 120);});

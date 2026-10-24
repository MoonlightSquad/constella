import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'i18n', 'locales');
const LOCALES = ['uk', 'en', 'de', 'fr'];

// Legal copy is an array of { h, p } blocks, so leaf walking recurses into arrays too.
function leaves(node, prefix = [], out = {}) {
  if (typeof node === 'string') out[prefix.join('.')] = node;
  else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) leaves(value, [...prefix, key], out);
  }
  return out;
}

function hasPath(tree, path) {
  return path.split('.').every((segment) => ((tree = tree?.[segment]) !== undefined));
}

const raw = Object.fromEntries(LOCALES.map((code) => [code, JSON.parse(readFileSync(join(localesDir, `${code}.json`), 'utf8'))]));
const messages = Object.fromEntries(LOCALES.map((code) => [code, leaves(raw[code])]));

test('every locale defines exactly the same keys as uk', () => {
  const expected = Object.keys(messages.uk).sort();
  assert.ok(expected.length > 100, `expected a populated dictionary, got ${expected.length} keys`);
  for (const code of LOCALES.filter((c) => c !== 'uk')) {
    const actual = Object.keys(messages[code]).sort();
    assert.deepEqual(
      { missing: expected.filter((k) => !actual.includes(k)), extra: actual.filter((k) => !expected.includes(k)) },
      { missing: [], extra: [] },
      `${code} is out of sync with uk`,
    );
  }
});

test('no translation is empty or not a string', () => {
  for (const code of LOCALES) {
    for (const [key, value] of Object.entries(messages[code])) {
      assert.equal(typeof value, 'string', `${code}: ${key} must be a string`);
      assert.notEqual(value.trim(), '', `${code}: ${key} is empty`);
    }
  }
});

// vue-i18n compiles messages with strictMessage: true, so these characters are syntax,
// not literal text: a translation containing one breaks the page at render time.
test('no message contains vue-i18n syntax characters', () => {
  for (const code of LOCALES) {
    for (const [key, value] of Object.entries(messages[code])) {
      const hostile = [...value].filter((ch) => '|@{}<>'.includes(ch));
      assert.deepEqual(hostile, [], `${code}: ${key} contains ${hostile.join('')}`);
    }
  }
});

// Claims removed on purpose: the product code does not back them.
test('unverifiable marketing claims stay out of the dictionary', () => {
  for (const code of LOCALES) {
    for (const key of [
      'landing.hero.statsUsers',
      'landing.hero.statsMatches',
      'landing.hero.statsRating',
      'landing.hero.ctaAppStore',
      'landing.hero.ctaGooglePlay',
      'landing.pricing.vipPrice',
      'landing.features.webrtcTitle',
      'landing.modal.scanQr',
    ]) {
      assert.ok(!hasPath(raw[code], key), `${code}: ${key} must not come back`);
    }
  }
});

test('literal keys used by components exist in every locale', () => {
  const used = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (['.vue', '.ts'].includes(extname(entry))) {
        // \b keeps `emit('save')` out of the set: without it the `t` of any identifier
        // ending in t reads as a translation call and demands a locale key that never existed.
        for (const match of readFileSync(path, 'utf8').matchAll(/(?:\$\s*t|\bt)(?:m)?\(\s*'([\w.]+)'/g)) used.add(match[1]);
      }
    }
  };
  walk(join(root, 'app'));
  assert.ok(used.size > 50, `expected literal i18n keys, found ${used.size}`);
  for (const key of used) {
    for (const code of LOCALES) assert.ok(hasPath(raw[code], key), `${code}: missing "${key}"`);
  }
});

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = join(root, 'i18n', 'locales');
const LOCALES = ['uk', 'en', 'de', 'fr'];

const read = (code) => JSON.parse(readFileSync(join(localesDir, `${code}.json`), 'utf8'));

// `faqItems`/`howSteps` stop at the first missing number, because that is what makes a
// sixth question one line of JSON instead of a component edit. The same rule is what makes
// a gap dangerous: `q7` without `q6` renders five questions and nobody notices.
const contiguous = (numbers) => numbers.length === new Set(numbers).size && numbers.every((n, i) => n === i + 1);

const faqNumbers = (keys, prefix) => keys.filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length)));

test('the FAQ pairs every question with an answer, numbered from 1 without gaps', () => {
  for (const code of LOCALES) {
    const keys = Object.keys(read(code).landing.faq);
    const questions = faqNumbers(keys, 'q').sort((a, b) => a - b);
    const answers = faqNumbers(keys, 'a').sort((a, b) => a - b);
    assert.ok(questions.length >= 2, `${code}: the FAQPage node needs at least two questions`);
    assert.deepEqual(questions, answers, `${code}: a question without an answer (or the reverse)`);
    assert.ok(contiguous(questions), `${code}: q/a numbering has a gap: ${questions.join(',')}`);
  }
});

test('every step of the guide carries its number, title and text', () => {
  for (const code of LOCALES) {
    const keys = Object.keys(read(code).landing.how);
    const numbered = new Map();
    for (const key of keys) {
      const match = /^step(\d+)(Num|Title|Desc)$/.exec(key);
      if (!match) continue;
      numbered.set(Number(match[1]), [...(numbered.get(Number(match[1])) ?? []), match[2]]);
    }
    const steps = [...numbered.keys()].sort((a, b) => a - b);
    assert.ok(steps.length >= 2, `${code}: the HowTo node needs at least two steps`);
    assert.ok(contiguous(steps), `${code}: step numbering has a gap: ${steps.join(',')}`);
    for (const step of steps) {
      assert.deepEqual([...numbered.get(step)].sort(), ['Desc', 'Num', 'Title'], `${code}: step${step} is incomplete`);
    }
  }
});

test('the sections enumerate their translations instead of a literal count', () => {
  for (const [file, helper] of [
    ['LandingFaq.vue', 'faqItems'],
    ['LandingHow.vue', 'howSteps'],
  ]) {
    const source = readFileSync(join(root, 'app', 'components', 'landing', file), 'utf8');
    assert.doesNotMatch(source, /v-for="[a-z]+ in \d+"/, `${file}: a hardcoded item count can drift from the dictionary`);
    assert.match(source, new RegExp(`${helper}\\(`), `${file}: must build its list from ${helper}`);
  }
});

// Both nodes claim the questions live on the page they are emitted from, so emitting the
// FAQ markup anywhere else is what Google calls misleading structured data.
test('the FAQ and guide markup is emitted only on the page that renders them', () => {
  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (extname(entry) === '.vue') pages.push([path, readFileSync(path, 'utf8')]);
    }
  };
  walk(join(root, 'app', 'pages'));
  const callers = pages.filter(([, source]) => /useLanding(Faq|HowTo)JsonLd\(\)/.test(source)).map(([path]) => path);
  assert.deepEqual(callers, [join(root, 'app', 'pages', 'index.vue')], 'landing FAQ/HowTo markup belongs to the home page only');
});

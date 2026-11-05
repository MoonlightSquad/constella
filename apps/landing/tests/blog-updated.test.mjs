import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SHOW_UPDATED_AFTER_DAYS, updatedNote } from '../app/utils/blog-date.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = '2026-09-01T09:00:00.000Z';
const daysLater = (days) => new Date(new Date(DAY).getTime() + days * 24 * 60 * 60 * 1000).toISOString();

test('a revision the reader cannot yet call a new version stays unannounced', () => {
  assert.equal(updatedNote(DAY, daysLater(SHOW_UPDATED_AFTER_DAYS - 1)), null);
  assert.equal(SHOW_UPDATED_AFTER_DAYS, 14, 'two weeks is the line between a typo fix and a rewrite');
});

test('the threshold itself is inclusive and reports the edit, not the publication', () => {
  const revised = daysLater(SHOW_UPDATED_AFTER_DAYS);
  assert.equal(updatedNote(DAY, revised), revised);
});

test('a row without both dates, or with a clock that ran backwards, emits nothing', () => {
  // Кракнуті дані не повинні перетворюватися на «Оновлено Invalid Date» під заголовком.
  assert.equal(updatedNote(null, DAY), null);
  assert.equal(updatedNote(DAY, undefined), null);
  assert.equal(updatedNote(DAY, 'не дата'), null);
  assert.equal(updatedNote(daysLater(3), DAY), null);
});

/**
 * Рядок живе в шаблоні, а не в тілі статті: markdown там серверний, і вставити тег у
 `.prose` можна лише правкою рендера.
 */
test('the article page renders the date as a time element, in its own row', () => {
  const source = readFileSync(join(root, 'app', 'pages', 'blog', '[slug].vue'), 'utf8');
  assert.match(source, /v-if="revised" class="updated"/);
  assert.match(source, /<time :datetime="revised">/, 'a machine-readable date next to the human one');
  assert.match(source, /\$t\('blog\.updated'\)/);
  assert.ok(!/class="post-head__meta"[^>]*v-if/.test(source), 'the publication row must stay regardless of the note');
});

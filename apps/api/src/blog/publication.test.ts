import assert from 'node:assert/strict';
import test from 'node:test';
import { missingPublicationFields } from './publication.js';

test('a seeded but unfinished translation cannot be published', () => {
  assert.deepEqual(
    missingPublicationFields({ title: 'Source title', excerpt: 'Source excerpt', bodyMarkdown: '' }),
    ['bodyMarkdown'],
  );
});

test('publication readiness rejects whitespace and accepts complete content', () => {
  assert.deepEqual(
    missingPublicationFields({ title: '  ', excerpt: 'Summary', bodyMarkdown: 'Body' }),
    ['title'],
  );
  assert.deepEqual(
    missingPublicationFields({ title: 'Title', excerpt: 'Summary', bodyMarkdown: 'Body' }),
    [],
  );
});

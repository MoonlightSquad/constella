import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('route-dependent pages use Nuxt route injection', async () => {
  for (const file of ['../app.vue', '../components/AuthAction.vue']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /const route = useRoute\(\)/, file);
    assert.doesNotMatch(source, /import\s*\{\s*useRoute\s*\}\s*from\s*['"]vue-router/, file);
  }
});

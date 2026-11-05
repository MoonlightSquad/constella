import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AssistantServiceError, requestSuggestions } from './client.js';

describe('assistant client', () => {
  it('sends only the chosen topic and locale through the internal service contract', async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const suggestions = ['One suggestion', 'Another suggestion', 'A third suggestion'];
    const result = await requestSuggestions(
      { locale: 'uk', topic: 'Подорожі' },
      {
        serviceUrl: 'https://ai.example.test/',
        token: 'x'.repeat(32),
        fetchImpl: async (url, init) => {
          captured = { url: String(url), init };
          return Response.json({ suggestions });
        },
      }
    );

    assert.deepEqual(result, suggestions);
    assert.equal(captured?.url, 'https://ai.example.test/v1/suggest');
    assert.deepEqual(JSON.parse(String(captured?.init?.body)), { locale: 'uk', topic: 'Подорожі' });
    assert.equal(new Headers(captured?.init?.headers).get('x-assistant-token'), 'x'.repeat(32));
  });

  it('fails closed when the service is not configured', async () => {
    await assert.rejects(() => requestSuggestions({ locale: 'en', topic: 'Music' }, {}), AssistantServiceError);
  });

  it('rejects malformed or incomplete provider responses', async () => {
    await assert.rejects(
      () => requestSuggestions(
        { locale: 'en', topic: 'Music' },
        {
          serviceUrl: 'https://ai.example.test',
          token: 'x'.repeat(32),
          fetchImpl: async () => Response.json({ suggestions: ['Only one'] }),
        }
      ),
      AssistantServiceError
    );
  });
});

import { z } from 'zod';

const SuggestionResponse = z.object({
  suggestions: z.array(z.string().trim().min(1).max(240)).length(3),
});

export type AssistantLocale = 'uk' | 'en' | 'de' | 'fr';
export type AssistantRequest = { locale: AssistantLocale; topic: string };
export type AssistantClientConfig = {
  serviceUrl?: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class AssistantServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssistantServiceError';
  }
}

export const requestSuggestions = async (
  input: AssistantRequest,
  config: AssistantClientConfig = {
    serviceUrl: process.env.AI_ASSISTANT_URL,
    token: process.env.AI_ASSISTANT_INTERNAL_TOKEN,
  }
): Promise<string[]> => {
  const serviceUrl = config.serviceUrl?.trim().replace(/\/+$/, '');
  const token = config.token?.trim();
  if (!serviceUrl || !token || token.length < 32) {
    throw new AssistantServiceError('Premium AI assistant is not configured.');
  }

  let response: Response;
  try {
    response = await (config.fetchImpl ?? globalThis.fetch)(`${serviceUrl}/v1/suggest`, {
      method: 'POST',
      headers: { 'x-assistant-token': token, 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 25_000),
    });
  } catch {
    throw new AssistantServiceError('Premium AI assistant is unavailable.');
  }
  if (!response.ok) throw new AssistantServiceError('Premium AI assistant is unavailable.');

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AssistantServiceError('Premium AI assistant returned an invalid response.');
  }
  const parsed = SuggestionResponse.safeParse(payload);
  if (!parsed.success) throw new AssistantServiceError('Premium AI assistant returned an invalid response.');
  return parsed.data.suggestions;
};

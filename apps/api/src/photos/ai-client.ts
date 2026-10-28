import { parseNsfwScores, type NsfwScores } from './decision.js';

export const AI_CLASSIFY_PATH = '/v1/classify-image';
const DEFAULT_TIMEOUT_MS = 3000;

export type ClassifyFailure = 'not_configured' | 'timeout' | 'unavailable' | 'bad_response';
export type ClassifyResult =
  | { ok: true; scores: NsfwScores; latencyMs: number }
  | { ok: false; reason: ClassifyFailure };

export type AiClientConfig = {
  serviceUrl?: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const cleanBaseUrl = (value: string) => value.replace(/\/+$/, '');

/**
 * Транспорне звернення до власного inference-сервісу: віддаємо байти, а не URL на R2,
 * щоб бокс ніколи не мав креденшалів сховища і щоб сумнівний контент не опинився
 * в CDN раніше за вердикт. Ніяких retry: безпечний фолбек (pending) вище по стеку.
 */
export const classifyImage = async (
  bytes: Uint8Array,
  config: AiClientConfig
): Promise<ClassifyResult> => {
  const serviceUrl = config.serviceUrl?.trim();
  const token = config.token?.trim();
  if (!serviceUrl || !token || token.length < 32) return { ok: false, reason: 'not_configured' };

  const timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const startedAt = Date.now();

  let response: Response;
  try {
    response = await doFetch(`${cleanBaseUrl(serviceUrl)}${AI_CLASSIFY_PATH}`, {
      method: 'POST',
      headers: { 'x-ai-token': token, 'content-type': 'image/webp' },
      body: bytes as unknown as BodyInit,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return { ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'unavailable' };
  }

  if (!response.ok) return { ok: false, reason: 'unavailable' };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: 'bad_response' };
  }

  const scores = parseNsfwScores((payload as { scores?: unknown } | null)?.scores);
  if (!scores) return { ok: false, reason: 'bad_response' };
  return { ok: true, scores, latencyMs: Date.now() - startedAt };
};

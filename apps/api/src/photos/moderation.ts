import { createLogger } from '@constella/shared';
import { classifyImage } from './ai-client.js';
import {
  DEFAULT_NSFW_THRESHOLDS,
  decideNsfw,
  type NsfwOutcome,
  type NsfwThresholds,
} from './decision.js';

const logger = createLogger('photo-moderation');

// Версія *пайплайну*, а не архітектура моделі: рядки у `photo_assets` історичні, а модель
// на боксі може змінитися (ViT ↔ MobileNetV2), і колонка не повинна брехати заднім числом.
export const NSFW_PROVIDER = 'ai-nsfw-v1';
export const UNMODERATED_PROVIDER = 'unmoderated';
export const UNAVAILABLE_PROVIDER = 'ai_unavailable';

export type ModerationResult = { status: NsfwOutcome; score: number | null; provider: string };
export type ModeratePhotoOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

const probabilityFrom = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
};

export const readThresholds = (env: Record<string, string | undefined> = process.env): NsfwThresholds => {
  const thresholds: NsfwThresholds = {
    rejectAt: probabilityFrom(env.AI_NSFW_REJECT_AT, DEFAULT_NSFW_THRESHOLDS.rejectAt),
    pendingAt: probabilityFrom(env.AI_NSFW_PENDING_AT, DEFAULT_NSFW_THRESHOLDS.pendingAt),
    sexyReviewAt: probabilityFrom(env.AI_NSFW_SEXY_REVIEW_AT, DEFAULT_NSFW_THRESHOLDS.sexyReviewAt),
  };
  // Invertований порядок означав би, що floor черги зʼїдає авто-відмову:
  // краще вже знайомі дефолти, ніж пороги, яких ніхто не перевіряв.
  if (thresholds.rejectAt <= thresholds.pendingAt) return DEFAULT_NSFW_THRESHOLDS;
  return thresholds;
};

/**
 * Один виклик на завантажене фото. Немає `AI_SERVICE_URL` — вимкнений прапорець,
 * і поведінка лишається рівно такою, як до модерації (коротке замикання на approve,
 * а не pending: інакше деплой миттєво затопив би людську чергу).
 *
 * Будь-яка відмова сервісу → `pending`, а не `approved` і не `rejected`: відхилення
 * за відсутності моделі калічить інфраструктурну аварію на видалені фото без шляху
 * оскарження, а схвалення відкрило б вікно для зливу саме під час простою.
 */
export const moderatePhoto = async (
  bytes: Uint8Array,
  options: ModeratePhotoOptions = {}
): Promise<ModerationResult> => {
  const env = options.env ?? process.env;
  const serviceUrl = env.AI_SERVICE_URL?.trim();
  if (!serviceUrl) return { status: 'approved', score: null, provider: UNMODERATED_PROVIDER };

  const timeoutMs = Number(env.AI_CLASSIFY_TIMEOUT_MS);
  const outcome = await classifyImage(bytes, {
    serviceUrl,
    token: env.AI_INTERNAL_TOKEN,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
    fetchImpl: options.fetchImpl,
  });

  if (!outcome.ok) {
    logger.warn('NSFW classification failed, holding the photo for human review', {
      reason: outcome.reason,
      serviceUrl,
    });
    return { status: 'pending', score: null, provider: UNAVAILABLE_PROVIDER };
  }

  const decided = decideNsfw(outcome.scores, readThresholds(env));
  logger.info('Photo classified', { status: decided.outcome, score: decided.score, latencyMs: outcome.latencyMs });
  return { status: decided.outcome, score: decided.score, provider: NSFW_PROVIDER };
};

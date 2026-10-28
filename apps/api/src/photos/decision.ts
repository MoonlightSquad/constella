export type NsfwScores = {
  drawings: number;
  neutral: number;
  sexy: number;
  porn: number;
  hentai: number;
};

export type NsfwOutcome = 'approved' | 'pending' | 'rejected';

export type NsfwThresholds = {
  rejectAt: number;
  pendingAt: number;
  sexyReviewAt: number;
};

// Класи саме в цьому порядку повертає nsfwjs MobileNetV2; будь-який інший вектор
// означає іншу модель і має змінити тут, а не мовчки проходити валідацію.
export const NSFW_CLASSES = ['drawings', 'neutral', 'sexy', 'porn', 'hentai'] as const;

export const DEFAULT_NSFW_THRESHOLDS: NsfwThresholds = {
  rejectAt: 0.8,
  pendingAt: 0.15,
  sexyReviewAt: 0.35,
};

const PROBABILITY_SUM_TOLERANCE = 0.05;

export const parseNsfwScores = (value: unknown): NsfwScores | null => {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const scores = {} as NsfwScores;
  for (const className of NSFW_CLASSES) {
    const probability = record[className];
    if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      return null;
    }
    scores[className] = probability;
  }
  const sum = NSFW_CLASSES.reduce((total, className) => total + scores[className], 0);
  if (Math.abs(sum - 1) > PROBABILITY_SUM_TOLERANCE) return null;
  return scores;
};

/**
 * «Очевидний» контент — тільки ці два класи. `sexy` принципово неоднозначний:
 * модель системно дає високу скору на купальники, а для дейтинг-профілю це норма,
 * тому він ніколи не відхиляє фото автоматично, лише веде в людську чергу.
 */
export const explicitScore = (scores: NsfwScores) => scores.porn + scores.hentai;

export const decideNsfw = (
  scores: NsfwScores,
  thresholds: NsfwThresholds = DEFAULT_NSFW_THRESHOLDS
): { outcome: NsfwOutcome; score: number } => {
  const score = explicitScore(scores);
  if (score >= thresholds.rejectAt) return { outcome: 'rejected', score };
  if (score >= thresholds.pendingAt || scores.sexy >= thresholds.sexyReviewAt) {
    return { outcome: 'pending', score };
  }
  return { outcome: 'approved', score };
};

/**
 * Ручні типи відповідей із `social.*`: сервер повертає `any[]` там, де `attachMeta`
 * (`apps/api/src/routers/social.ts:137`) втрачає точність, тож описуємо формат-контракт
 * тут, а не сподіваємось на інференс. Поля збігаються з `toPublicProfile`
 * (`apps/api/src/engine/core.ts:75`).
 */
export type PublicProfile = {
  id: string;
  displayName: string;
  age: number;
  gender: string;
  city: string | null;
  bio: string | null;
  quote: string | null;
  photos: string[];
  prompts: string[];
  interests: string[];
  verified: boolean;
  level: number;
  zodiac: string | null;
  matchPercent: number;
  distanceKm: number | null;
  badges: string[];
  boosted: boolean;
  vip: boolean;
};

export type ChatMessage = {
  /** Від'ємний `id` — локальна бульбашка, ще не підтверджена сервером (див. `sendText`). */
  id: number;
  pending?: boolean;
  matchId: string;
  senderId: string;
  body: string;
  kind: 'text' | 'system' | 'voice' | 'contact' | 'call' | 'image' | 'video';
  createdAt: string;
  readAt: string | null;
  deliveredAt: string | null;
};

/** `{ kind, url, fileName, size }` / `{ audioUrl, durationSec }` — рядок у `messages.body`. */
export type MediaPayload = { url: string; kind: 'image' | 'video'; fileName?: string; size?: number; round?: boolean; durationSec?: number };
export type VoicePayload = { audioUrl: string; durationSec: number };

/**
 * Медіа в тілі повідомлення, або `null`, якщо це простий текст. `messages.kind` не має
 * значень image/video (`packages/db/src/schema.ts:269`), а `social.sendMessage` пише
 * `text`, тому єдиний надійний винести тип — сам JSON у `body`.
 */
export const mediaFromBody = (body: string): MediaPayload | null => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object') return null;
    const entry = parsed as Record<string, unknown>;
    if (typeof entry.url !== 'string' || (entry.kind !== 'image' && entry.kind !== 'video')) return null;
    return {
      url: entry.url,
      kind: entry.kind,
      fileName: typeof entry.fileName === 'string' ? entry.fileName : '',
      size: typeof entry.size === 'number' ? entry.size : 0,
      round: entry.round === true,
      durationSec: typeof entry.durationSec === 'number' ? entry.durationSec : 0,
    };
  } catch {
    return null;
  }
};

/** Те, що реально малюємо: `kind` з БД плюс фолбек на JSON-тіло. */
export const displayKind = (message: Pick<ChatMessage, 'kind' | 'body'>): ChatMessage['kind'] =>
  message.kind === 'text' ? (mediaFromBody(message.body)?.kind ?? 'text') : message.kind;

export const parseVoice = (body: string): VoicePayload => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && 'audioUrl' in parsed && typeof parsed.audioUrl === 'string') {
      return { audioUrl: parsed.audioUrl, durationSec: 'durationSec' in parsed ? Number(parsed.durationSec ?? 0) : 0 };
    }
  } catch {
    // Те саме: рядок — це вже URL.
  }
  return { audioUrl: body, durationSec: 0 };
};

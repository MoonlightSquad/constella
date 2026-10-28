import type { TranslationKey } from '@/i18n/messages';

import { formatTime } from './dates';

/**
 * Мітка чату у списку — як у WhatsApp: сьогодні час, далі «Вчора», потім день тижня,
 * потім дата. TS-дзеркало `apps/web/composables/chat-list.mjs`: дві копії свідомо, бо в
 * Expo немає тест-раннера, а `Intl` на Hermes ламається на частині локалей.
 */
export const WEEKDAY_KEYS: TranslationKey[] = [
  'chats.weekdaySun',
  'chats.weekdayMon',
  'chats.weekdayTue',
  'chats.weekdayWed',
  'chats.weekdayThu',
  'chats.weekdayFri',
  'chats.weekdaySat',
];

export type ChatStamp =
  | { kind: 'time' }
  | { kind: 'label'; key: TranslationKey }
  | { kind: 'date'; text: string };

const DAY_MS = 86_400_000;
const pad = (value: number) => String(value).padStart(2, '0');

/** Початок локальної доби — інакше 23:59 і 00:01 різнились би менш ніж на добу. */
const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const asDate = (value: string | Date | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function chatStampOf({
  at,
  now = new Date(),
}: {
  at: string | Date | null | undefined;
  now?: Date;
}): ChatStamp | null {
  const date = asDate(at);
  if (!date) return null;
  const days = Math.round((dayStart(now) - dayStart(date)) / DAY_MS);
  if (days <= 0) return { kind: 'time' };
  if (days === 1) return { kind: 'label', key: 'chats.stampYesterday' };
  if (days < 7) return { kind: 'label', key: WEEKDAY_KEYS[date.getDay()] };
  const text = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
  return {
    kind: 'date',
    text: date.getFullYear() === now.getFullYear() ? text : `${text}.${date.getFullYear()}`,
  };
}

/** Готовий текст мітки: `time` віддаємо локальному `formatTime`, решту — словнику. */
export const chatStampText = (
  at: string | Date | null | undefined,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
): string => {
  const shown = chatStampOf({ at });
  if (!shown) return '';
  if (shown.kind === 'time') return formatTime(at);
  if (shown.kind === 'label') return t(shown.key);
  return shown.text;
};

/**
 * Ініціали з вільного `display_name` — окремих імені та прізвища в БД немає. Перші
 * літери перших двох слів; порожньо → '', щоб UI показав «✦».
 */
export function initialsOf(name: string | null | undefined): string {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return words.map((word) => Array.from(word)[0]!.toUpperCase()).join('');
}

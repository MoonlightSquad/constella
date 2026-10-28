/**
 * Мітка чату у списку — як у WhatsApp: сьогодні грає час, далі «Вчора», потім день
 * тижня, потім дата. Назви днів беремо зі словника, а не з `Intl`: у Expo Hermes ICU
 * покритий не повністю (`apps/mobile/src/utils/dates.ts`), а список має виглядати
 * однаково на обох клієнтах.
 */
export const WEEKDAY_KEYS = [
  'chats.weekdaySun',
  'chats.weekdayMon',
  'chats.weekdayTue',
  'chats.weekdayWed',
  'chats.weekdayThu',
  'chats.weekdayFri',
  'chats.weekdaySat',
];

const DAY_MS = 86_400_000;
const pad = (value) => String(value).padStart(2, '0');

/** Початок локальної доби — інакше 23:59 і 00:01 різнились би менш ніж на добу. */
const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const asDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * `time` — час нехай форматує клієнт (`Intl` у вебі, вручну в Expo); `label` — ключ
 * словника; `date` — вже готовий текст, у чужому році з роком. `null` — дати немає.
 * `round` у різниці діб з’їдає DST-зсув, майбутню мітку рахуємо «сьогодні».
 */
export function chatStampOf({ at, now = new Date() }) {
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

/**
 * Ініціали з вільного `display_name` — окремих імені та прізвища в БД немає. Беремо
 * перші літери перших двох слів; порожньо → `''`, щоб UI показав «✦».
 */
export function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return words.map((word) => Array.from(word)[0].toUpperCase()).join('');
}

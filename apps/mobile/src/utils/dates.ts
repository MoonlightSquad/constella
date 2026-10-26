import { getCalendars } from 'expo-localization';

/**
 * `@constella/shared` валідує `timeZone` через `Intl.DateTimeFormat`, а в Hermes ICU
 * покриває не всі локалі (`profile.ts:43`). Тому тут два джерела з фолбеком на 'UTC',
 * який сервер приймає як валідний.
 */
export const deviceTimeZone = (): string => {
  try {
    const zone: unknown = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof zone === 'string' && zone.length > 0) return zone;
  } catch {
    // Hermes без повного ICU кидає тут.
  }
  return getCalendars()[0]?.timeZone ?? 'UTC';
};

/** Той самий ISO-формат, що й `ProfileSetup.vue:48`. */
export const toIsoDate = (value: Date | string | null | undefined): string => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export const ageOn = (isoDate: string, now = new Date()): number => {
  const birth = new Date(isoDate);
  if (Number.isNaN(birth.getTime())) return 0;
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** `HH:MM` вручну: `toLocaleTimeString` у Hermes без повного ICU падає на локалях. */
export const formatTime = (value: string | Date | null | undefined): string => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Замість `toLocaleString('uk-UA')`, як у `SupportDesk.vue:27`. */
export const formatDateTime = (value: string | Date | null | undefined): string => {
  const iso = toIsoDate(value);
  if (!iso) return '';
  return `${iso} ${formatTime(value)}`;
};

export const latestBirthdate = (): Date => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date;
};

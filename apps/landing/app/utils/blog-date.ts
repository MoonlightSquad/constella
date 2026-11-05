const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/** `language` is the BCP 47 tag from the i18n locale, so "12 жовтня 2026" and "12 octobre 2026" agree. */
export const formatDate = (value: string | null | undefined, language: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language, DATE_OPTIONS).format(date);
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Правка через тиждень після публікації — це редактор, що знайшов одруківку, а не нова
 * версія тексту. Показувати за неї «Оновлено» означає вчити читача, що рядок про дату
 * нічого не вартий; поріг у два тижні лишає сигнал для справжніх переробок.
 */
export const SHOW_UPDATED_AFTER_DAYS = 14;

/** Дата редагування, яку варто показати, або `null`, якщо «Оновлено» ще не є правдою про текст. */
export const updatedNote = (
  publishedAt: string | null | undefined,
  updatedAt: string | null | undefined,
): string | null => {
  if (!publishedAt || !updatedAt) return null;
  const published = new Date(publishedAt).getTime();
  const revised = new Date(updatedAt).getTime();
  if (Number.isNaN(published) || Number.isNaN(revised)) return null;
  return revised - published >= SHOW_UPDATED_AFTER_DAYS * DAY_MS ? updatedAt : null;
};

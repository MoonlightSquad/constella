const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/** `language` is the BCP 47 tag from the i18n locale, so "12 жовтня 2026" and "12 octobre 2026" agree. */
export const formatDate = (value: string | null | undefined, language: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language, DATE_OPTIONS).format(date);
};

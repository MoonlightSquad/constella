/**
 * One formatter for every table and card: `toLocaleString` inline in a template renders
 * differently depending on the browser locale of whoever is moderating, which is exactly
 * the wrong kind of instability for an audit trail.
 */
const dateTime = new Intl.DateTimeFormat('uk-UA', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// `birthdate` is a date column: rendering it through the timestamp formatter shows the
// midnight-to-UTC offset as a real hour ("27.01.1998, 02:00"), which reads like data.
const dayOnly = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const fmtDate = (value: string | Date | null | undefined) =>
  value ? dateTime.format(new Date(value)) : '—';

export const fmtDay = (value: string | Date | null | undefined) =>
  value ? dayOnly.format(new Date(value)) : '—';

export const fmtNumber = (value: number | null | undefined) =>
  typeof value === 'number' ? new Intl.NumberFormat('uk-UA').format(value) : '—';

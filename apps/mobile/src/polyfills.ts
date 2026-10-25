/**
 * Сторонні поліфіли + самотест середовища. Імпортується ПЕРШИМ у `src/app/_layout.tsx`,
 * щоб `new URL` уже був доступний, коли zod-схеми з `@constella/shared/client`
 * почнуть валідувати фото-URL-и (`profile.ts:8`).
 */
import 'react-native-url-polyfill/auto';

export type RuntimeCapabilities = {
  url: boolean;
  intlTimeZone: boolean;
  detail: string;
};

/**
 * `@constella/shared/profile.ts:43` будує `new Intl.DateTimeFormat(..., { timeZone })`.
 * у Hermes ICU inborn, але підтримка time zone залежить від збірки — тому не вгадуємо,
 * а перевіряємо в рантаймі. Якщо `intlTimeZone === false`, форматувати дату треба
 * через `date-fns-tz`, інакше на деяких пристроях вилетить `RangeError`.
 */
export const probeRuntime = (): RuntimeCapabilities => {
  let url = false;
  try {
    url = new URL('https://constella.pp.ua').protocol === 'https:';
  } catch {
    url = false;
  }

  let intlTimeZone = false;
  let detail = '';
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Kyiv',
      hour: '2-digit',
    }).format(new Date());
    intlTimeZone = typeof formatted === 'string' && formatted.length > 0;
    detail = `Intl → ${formatted}`;
  } catch (error) {
    detail = `Intl → ${error instanceof Error ? error.message : String(error)}`;
  }

  return { url, intlTimeZone, detail };
};

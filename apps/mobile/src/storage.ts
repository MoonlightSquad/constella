import * as SecureStore from 'expo-secure-store';

/**
 * Єдине місце, де ми торкаємось персистентного сховища. `expo-secure-store` —
 * Keychain на iOS і Keystore на Android; `localStorage`-аналог (`AsyncStorage`)
 * тут свідомо не використовуємо, бо JWT літає з цим токеном до продакшн-API.
 */
export const STORAGE_KEYS = {
  token: 'constella_token',
  locale: 'constella_locale',
  pushToken: 'constella_push_token',
} as const;

export const readSecret = (key: string) => SecureStore.getItemAsync(key);

export const writeSecret = (key: string, value: string) => SecureStore.setItemAsync(key, value);

export const clearSecret = async (key: string) => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Видалення відсутнього ключа не повинно ламати logout.
  }
};

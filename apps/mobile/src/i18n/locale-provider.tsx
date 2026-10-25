import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';

import { messages, type TranslationKey } from './messages';
import { STORAGE_KEYS, readSecret, writeSecret } from '@/storage';

export const supportedLocales = ['uk', 'en', 'de', 'fr'] as const;
export type AppLocale = (typeof supportedLocales)[number];

const localeNames: Record<AppLocale, string> = {
  uk: 'Українська',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
};

const isSupported = (value: unknown): value is AppLocale =>
  supportedLocales.includes(value as AppLocale);

const deviceLocale = (): AppLocale => {
  const code = getLocales()[0]?.languageCode;
  return isSupported(code) ? code : 'uk';
};

/** Формат `t` і слотів кортежу ідентичний `apps/web/composables/useLocale.ts:395-401`. */
const translate = (locale: AppLocale, key: TranslationKey, values?: Record<string, string | number>) => {
  const index = supportedLocales.indexOf(locale);
  const template = messages[key][index] || messages[key][1];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(values?.[name] ?? match));
};

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(deviceLocale);

  useEffect(() => {
    // Збережений вибір користувача важливіший за мову системи.
    void readSecret(STORAGE_KEYS.locale).then((stored) => {
      if (isSupported(stored)) setLocaleState(stored);
    });
  }, []);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    void writeSecret(STORAGE_KEYS.locale, next).catch(() => undefined);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key, values) => translate(locale, key, values) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale() поза <LocaleProvider>');
  return { ...context, localeNames, supportedLocales };
}

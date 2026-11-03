import type { BlogLocale } from '~/types/blog';

// Форк term-draft.ts: форма та сама (чотири слоти перекладів + «видалити мову»), але в
// автора переклад несе роль і біо, а аватар і sameAs живуть на сутності — одна пара на
// всі чотири мови, бо фото й профілі в людини не перекладаються.

export const AUTHOR_MAX = { name: 120, role: 120, bio: 1000, alt: 200, sameAs: 8 };

export type AuthorTranslationDraft = {
  locale: BlogLocale;
  slug: string;
  name: string;
  role: string;
  bio: string;
  seoTitle: string;
  seoDescription: string;
};

export type AuthorDraft = {
  translations: AuthorTranslationDraft[];
  removedLocales: BlogLocale[];
  avatarUrl: string;
  avatarAlt: string;
  /** Textarea: один профіль на рядок. На wire — масив, бо schema чекає саме його. */
  sameAs: string;
};

/** Wire-форма перекладу: DB null лишається null, щоб diff бачив «очищене поле». */
export type AuthorTranslationWire = {
  authorId?: string;
  locale: BlogLocale;
  slug: string;
  name: string;
  role: string | null;
  bio: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

export type AuthorRowWire = {
  id: string;
  createdAt?: string;
  avatarUrl?: string | null;
  avatarAlt?: string | null;
  sameAs?: string[] | null;
  postCount: number;
  translations: AuthorTranslationWire[];
};

const AUTHOR_LOCALES: BlogLocale[] = ['uk', 'en', 'de', 'fr'];

export const emptyAuthorDraft = (): AuthorDraft => ({
  translations: AUTHOR_LOCALES.map((locale) => ({ locale, slug: '', name: '', role: '', bio: '', seoTitle: '', seoDescription: '' })),
  removedLocales: [],
  avatarUrl: '',
  avatarAlt: '',
  sameAs: '',
});

/** Рядок бази → форма: DB null стає '', щоб інпути лишались контрольованими. */
export const authorDraftFromRow = (author: AuthorRowWire | null): AuthorDraft => {
  const draft = emptyAuthorDraft();
  if (!author) return draft;
  draft.avatarUrl = author.avatarUrl ?? '';
  draft.avatarAlt = author.avatarAlt ?? '';
  draft.sameAs = (author.sameAs ?? []).join('\n');
  for (const row of author.translations) {
    const slot = draft.translations.find((item) => item.locale === row.locale);
    if (!slot) continue;
    slot.slug = row.slug;
    slot.name = row.name;
    slot.role = row.role ?? '';
    slot.bio = row.bio ?? '';
    slot.seoTitle = row.seoTitle ?? '';
    slot.seoDescription = row.seoDescription ?? '';
  }
  return draft;
};

const filled = (slot: AuthorTranslationDraft) => Boolean(slot.name.trim() && slot.slug.trim());

/** Порожній рядок textarea — не профіль: порожні рядки й duplicate не йдуть на wire. */
export const parseSameAs = (text: string) => [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))];

const toBody = (slot: AuthorTranslationDraft): Record<string, unknown> => ({
  locale: slot.locale,
  slug: slot.slug,
  name: slot.name,
  role: slot.role,
  bio: slot.bio,
  seoTitle: slot.seoTitle,
  seoDescription: slot.seoDescription,
});

/**
 * PATCH несе лише змінені локалі. '' в означеному полі — «очистити»; аватар і sameAs —
 * не переклади, тому вони порівнюються з рядком окремо.
 */
export const patchFromAuthorDraft = (author: AuthorRowWire, draft: AuthorDraft): Record<string, unknown> => {
  const known = new Map(author.translations.map((row) => [row.locale, row]));
  const translations: Record<string, unknown>[] = [];

  for (const slot of draft.translations) {
    if (draft.removedLocales.includes(slot.locale)) continue;
    const original = known.get(slot.locale);
    if (!original) {
      if (filled(slot)) translations.push(toBody(slot));
      continue;
    }
    const entry: Record<string, unknown> = { locale: slot.locale };
    if (slot.slug !== original.slug) entry.slug = slot.slug;
    if (slot.name !== original.name) entry.name = slot.name;
    if (slot.role !== (original.role ?? '')) entry.role = slot.role;
    if (slot.bio !== (original.bio ?? '')) entry.bio = slot.bio;
    if (slot.seoTitle !== (original.seoTitle ?? '')) entry.seoTitle = slot.seoTitle;
    if (slot.seoDescription !== (original.seoDescription ?? '')) entry.seoDescription = slot.seoDescription;
    if (Object.keys(entry).length > 1) translations.push(entry);
  }

  const patch: Record<string, unknown> = {};
  if (translations.length) patch.translations = translations;
  if (draft.removedLocales.length) patch.removeLocales = [...draft.removedLocales];
  if (draft.avatarUrl !== (author.avatarUrl ?? '')) patch.avatarUrl = draft.avatarUrl;
  if (draft.avatarAlt !== (author.avatarAlt ?? '')) patch.avatarAlt = draft.avatarAlt;
  // sameAs замінюється цілком: partial-update списку не існує, тому й diff — порівняння рядків.
  const sameAs = parseSameAs(draft.sameAs);
  if (sameAs.join('\n') !== (author.sameAs ?? []).join('\n')) patch.sameAs = sameAs;
  return patch;
};

/** Create — повне тіло: primary-локалі окремо, решта заповнених вкладок у `translations`. */
export const createAuthorBody = (locale: BlogLocale, draft: AuthorDraft): Record<string, unknown> => {
  const primary = draft.translations.find((slot) => slot.locale === locale)!;
  const extras = draft.translations.filter((slot) => slot.locale !== locale && filled(slot));
  return {
    locale,
    slug: primary.slug,
    name: primary.name,
    role: primary.role,
    bio: primary.bio,
    seoTitle: primary.seoTitle,
    seoDescription: primary.seoDescription,
    avatarUrl: draft.avatarUrl,
    avatarAlt: draft.avatarAlt,
    sameAs: parseSameAs(draft.sameAs),
    translations: extras.map(toBody),
  };
};

/** Підказка формі: вкладка заповнена лише частково — переклад не збережеться. */
export const halfFilledAuthorLocales = (draft: AuthorDraft): BlogLocale[] =>
  draft.translations
    .filter((slot) => (slot.name.trim() || slot.slug.trim()) && !filled(slot) && !draft.removedLocales.includes(slot.locale))
    .map((slot) => slot.locale);

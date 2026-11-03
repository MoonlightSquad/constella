import type { BlogLocale } from '~/types/blog';

export type TermKind = 'category' | 'tag';

export const TERM_LOCALES: BlogLocale[] = ['uk', 'en', 'de', 'fr'];

/** Одна редагована мова терміна; DB null стає '', щоб інпути лишались контрольованими. */
export type TermTranslationDraft = {
  locale: BlogLocale;
  slug: string;
  name: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
};

export type TermDraft = {
  /** Завжди чотири слоти: наявні переклади та порожні вкладки для нових. */
  translations: TermTranslationDraft[];
  removedLocales: BlogLocale[];
  /** Pillar «почати тут» — id *групи* статті; '' — не прикріплено. Теґи цього поля не мають. */
  pinnedPostGroupId: string;
};

/** Wire-форма обох видів: tag-рядки просто не мають додаткових полів. */
export type TermTranslationWire = TermTranslationDraft & {
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type TermRowWire = {
  id: string;
  createdAt?: string;
  postCount: number;
  translations: TermTranslationWire[];
  pinnedPostGroupId?: string | null;
};

export const emptyTermDraft = (): TermDraft => ({
  translations: TERM_LOCALES.map((locale) => ({ locale, slug: '', name: '', description: '', seoTitle: '', seoDescription: '' })),
  removedLocales: [],
  pinnedPostGroupId: '',
});

export const termDraftFromRow = (term: TermRowWire | null): TermDraft => {
  const draft = emptyTermDraft();
  if (!term) return draft;
  draft.pinnedPostGroupId = term.pinnedPostGroupId ?? '';
  for (const row of term.translations) {
    const slot = draft.translations.find((item) => item.locale === row.locale);
    if (!slot) continue;
    slot.slug = row.slug;
    slot.name = row.name;
    slot.description = row.description ?? '';
    slot.seoTitle = row.seoTitle ?? '';
    slot.seoDescription = row.seoDescription ?? '';
  }
  return draft;
};

const filled = (slot: TermTranslationDraft) => Boolean(slot.name.trim() && slot.slug.trim());

const toBody = (slot: TermTranslationDraft, kind: TermKind): Record<string, unknown> => {
  if (kind === 'tag') {
    const body: Record<string, unknown> = { locale: slot.locale };
    if (slot.slug) body.slug = slot.slug;
    if (slot.name) body.name = slot.name;
    return body;
  }
  return {
    locale: slot.locale,
    slug: slot.slug,
    name: slot.name,
    description: slot.description,
    seoTitle: slot.seoTitle,
    seoDescription: slot.seoDescription,
  };
};

/**
 * PATCH несе лише змінені локалі: порожня вкладка нового переклада — «нічого не треба»,
 * заповнена — дописування. '' в означених полях категорії — «очистити» (schema це переживає).
 */
export const patchFromTermDraft = (term: TermRowWire, draft: TermDraft, kind: TermKind): Record<string, unknown> => {
  const known = new Map(term.translations.map((row) => [row.locale, row]));
  const translations: Record<string, unknown>[] = [];

  for (const slot of draft.translations) {
    if (draft.removedLocales.includes(slot.locale)) continue;
    const original = known.get(slot.locale);
    if (!original) {
      if (filled(slot)) translations.push(toBody(slot, kind));
      continue;
    }
    const entry: Record<string, unknown> = { locale: slot.locale };
    if (slot.slug !== original.slug) entry.slug = slot.slug;
    if (slot.name !== original.name) entry.name = slot.name;
    if (kind === 'category') {
      if (slot.description !== (original.description ?? '')) entry.description = slot.description;
      if (slot.seoTitle !== (original.seoTitle ?? '')) entry.seoTitle = slot.seoTitle;
      if (slot.seoDescription !== (original.seoDescription ?? '')) entry.seoDescription = slot.seoDescription;
    }
    if (Object.keys(entry).length > 1) translations.push(entry);
  }

  const patch: Record<string, unknown> = {};
  if (translations.length) patch.translations = translations;
  if (draft.removedLocales.length) patch.removeLocales = [...draft.removedLocales];
  // Pin — не переклад: '' у patch очищає його (валідує схема), тому зміну видно навіть
  // коли жодна вкладка не рушалась — інакше «прибрати pillar» не збереглося б.
  if (kind === 'category' && draft.pinnedPostGroupId !== (term.pinnedPostGroupId ?? '')) {
    patch.pinnedPostGroupId = draft.pinnedPostGroupId;
  }
  return patch;
};

/** Create — повне тіло: primary-локалі окремо, решта заповнених вкладок у `translations`. */
export const createTermBody = (locale: BlogLocale, draft: TermDraft, kind: TermKind): Record<string, unknown> => {
  const primary = draft.translations.find((slot) => slot.locale === locale)!;
  const extras = draft.translations.filter((slot) => slot.locale !== locale && filled(slot));
  const body: Record<string, unknown> = { locale, slug: primary.slug, name: primary.name, translations: extras.map((slot) => toBody(slot, kind)) };
  if (kind === 'category') {
    body.description = primary.description;
    body.seoTitle = primary.seoTitle;
    body.seoDescription = primary.seoDescription;
  }
  return body;
};

/** Підказка формі: вкладка заповнена лише частково — переклад не збережеться. */
export const halfFilledLocales = (draft: TermDraft): BlogLocale[] =>
  draft.translations
    .filter((slot) => (slot.name.trim() || slot.slug.trim()) && !filled(slot) && !draft.removedLocales.includes(slot.locale))
    .map((slot) => slot.locale);

export type PillarOption = { groupId: string; label: string; publishedLocales: BlogLocale[] };

/**
 * Рядки категорії (усі локалі, чернетки теж) → унікальні за групою варіанти для
 * select. Підпис беремо з uk-рядка (канонічний рядок категорії з 0015), а мови, де
 * стаття опублікована, показуємо окремо: архів іншої мови цей блок не рендерить, і редактор
 * має бачити це до збереження, а не після.
 */
export const pillarOptionsFor = (
  rows: { groupId: string; locale: BlogLocale; title: string; status: string }[],
): PillarOption[] => {
  const groups = new Map<string, { label: string; publishedLocales: BlogLocale[] }>();
  for (const row of rows) {
    const group = groups.get(row.groupId);
    if (!group) {
      groups.set(row.groupId, { label: row.title, publishedLocales: row.status === 'published' ? [row.locale] : [] });
      continue;
    }
    if (row.locale === 'uk') group.label = row.title;
    if (row.status === 'published' && !group.publishedLocales.includes(row.locale)) group.publishedLocales.push(row.locale);
  }
  return [...groups.entries()]
    .map(([groupId, group]) => ({ groupId, ...group }))
    .sort((a, b) => a.label.localeCompare(b.label, 'uk'));
};

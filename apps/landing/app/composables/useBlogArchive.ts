import type { Crumb } from '~/utils/json-ld';
import type { BlogLocale, BlogPostSummary, TermAlternate } from '~/types/blog';

/** Те, що повертають `/api/blog/category` і `/api/blog/tag`. */
export type BlogArchiveTerm = {
  id: string;
  slug: string;
  name: string;
  postCount: number;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** Тонкий термін — лише тегові архіви; категорій це не стосується. */
  noindex?: boolean;
  alternates: TermAlternate[];
};

type BlogList = { items: BlogPostSummary[]; nextCursor: string | null };
const PAGE_SIZE = 12;

/** Перша сторінка + курсор «старіші» — та сама пагінація, що й на індексі блогу. */
export const usePagedArchivePosts = async (filter: ComputedRef<Record<string, string>>) => {
  const { locale } = useI18n();
  const { data: first, refresh } = await useFetch<BlogList>('/api/blog/posts', {
    query: computed(() => ({ locale: locale.value, limit: PAGE_SIZE, ...filter.value })),
  });
  const older = ref<BlogList[]>([]);
  watch(filter, () => { older.value = []; });

  const items = computed(() => [...(first.value?.items ?? []), ...older.value.flatMap((page) => page.items)]);
  const nextCursor = computed(() =>
    older.value.length ? older.value.at(-1)?.nextCursor ?? null : first.value?.nextCursor ?? null,
  );

  const loading = ref(false);
  const loadMore = async () => {
    if (!nextCursor.value || loading.value) return;
    loading.value = true;
    try {
      older.value.push(await $fetch<BlogList>('/api/blog/posts', {
        query: { locale: locale.value, limit: PAGE_SIZE, ...filter.value, cursor: nextCursor.value },
      }));
    } finally {
      loading.value = false;
    }
  };

  return { items, nextCursor, loading, loadMore, refresh };
};

/**
 * Сторінки-архіви категорій і тегів. Кластер hreflang і перемикач мов беруться з
 * терміна, а не з URL: slug у кожній мові локалізований, як і в перекладених статей.
 */
export const useBlogArchive = (kind: 'category' | 'tag', term: BlogArchiveTerm, items: Ref<BlogPostSummary[]>) => {
  const { t, locale, localeProperties, locales } = useI18n();
  const route = useRoute();
  const localePath = useLocalePath();
  const { siteUrl } = useRuntimeConfig().public;
  const { declare: declareAlternates } = useSeoAlternates();

  const pathFor = (code: BlogLocale, slug: string) => `${code === 'uk' ? '' : `/${code}`}/blog/${kind}/${slug}`;
  const hreflangOf = (code: BlogLocale) => locales.value.find((item) => item.code === code)?.language ?? code;

  // Порожній архів апстрим не віддає (404), тож cluster завжди має хоч одну мову.
  declareAlternates(term.alternates.map((item) => ({ locale: item.locale, path: pathFor(item.locale, item.slug) })));

  const primary = term.alternates.find((item) => item.locale === 'uk') ?? term.alternates[0];
  const headline = term.seoTitle || term.name;
  const summary = term.seoDescription || term.description || `${term.name} — ${t('blog.archiveBlurb')}`;
  const canonical = `${siteUrl}${route.path}`;

  useSeoMeta({
    title: headline,
    description: summary,
    ogTitle: headline,
    ogDescription: summary,
    ogType: 'website',
    // The term's own name is database content, so the card needs no copy this page has to keep in sync.
    ogImage: `${siteUrl}/api/og?kind=${kind}&slug=${encodeURIComponent(term.slug)}&locale=${locale.value}`,
    ogUrl: canonical,
    twitterCard: 'summary_large_image',
    // Тонкий архів (одна стаття) не просить Google його індексувати, але й не ховає посилання:
    // `follow` тримає внутрішній граф. Пару цьому сигналу ставить API — той самий архів
    // відсутній у sitemap.
    ...(term.noindex ? { robots: 'noindex, follow' } : {}),
  });

  useHead(() => ({
    link: [
      ...(primary ? [{ rel: 'alternate', hreflang: 'x-default', href: `${siteUrl}${pathFor(primary.locale, primary.slug)}` }] : []),
      ...term.alternates.map((item) => ({ rel: 'alternate', hreflang: hreflangOf(item.locale), href: `${siteUrl}${pathFor(item.locale, item.slug)}` })),
      { rel: 'canonical', href: canonical },
    ],
  }));

  // Остання крихта — сам архів, тому без шляху: його @id уже несе CollectionPage вище.
  const crumbs = computed<Crumb[]>(() => [
    { name: t('blog.crumbs.home'), path: localePath('/') },
    { name: t('blog.crumbs.blog'), path: localePath('/blog') },
    { name: term.name },
  ]);
  useBreadcrumbList(() => crumbs.value);

  useJsonLd(() => ({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: term.name,
    description: summary,
    url: canonical,
    inLanguage: localeProperties.value?.language ?? 'uk-UA',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: term.postCount,
      itemListElement: items.value.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${siteUrl}${localePath(`/blog/${item.slug}`)}`,
        name: item.title,
      })),
    },
  }));

  return { pathFor, crumbs };
};

import type { BlogLocale } from '~/types/blog';

export type SeoAlternate = { locale: BlogLocale, path: string };

/**
 * A post translated into two languages does not have a page under the other two
 * prefixes, so neither the generated hreflang cluster nor the language switcher may
 * offer them. `definePageMeta({ seoAlternates: true })` hands the cluster to the page
 * (see app.vue); this state hands the switcher the list of languages that exist.
 */
export const useSeoAlternates = () => {
  const route = useRoute();
  const store = useState<Record<string, SeoAlternate[]>>('seo-alternates', () => ({}));

  return {
    alternates: computed(() => store.value[route.path] ?? null),
    declare: (values: SeoAlternate[]) => {
      store.value[route.path] = values;
    },
  };
};

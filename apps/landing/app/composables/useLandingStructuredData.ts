/**
 * Google прибрав FAQPage та HowTo з видачі у 2023, тож це не багатші сниппети. Сенс у
 * іншому: Bing, голосові асистенти й агрегатори беруть відповіді саме з розмітки, а вона
 * не може роз'їхатися з тим, що бачить людина, бо джерело в них одне
 * (`faqItems`/`howSteps`). Емітується лише на `/`: зараховується та сторінка, де секція
 * справді рендериться.
 */

/**
 * `@id` has to name the page the crawler is looking at, so it takes the canonical form
 * `app.vue` writes (no trailing slash) instead of minting a second URL for one page.
 */
const fragmentId = (siteUrl: string, path: string, fragment: string) => `${siteUrl}${path.replace(/\/$/, '')}#${fragment}`;

export const useLandingFaqJsonLd = () => {
  const { t, te } = useI18n();
  const { siteUrl } = useRuntimeConfig().public;
  const path = useRequestURL().pathname;

  useJsonLd(() => {
    const items = faqItems(t, te);
    if (items.length < 2) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': fragmentId(siteUrl, path, 'faq'),
      mainEntity: items.map((item) => ({
        '@type': 'Question',
        name: item.name,
        acceptedAnswer: { '@type': 'Answer', text: item.text },
      })),
    };
  });
};

export const useLandingHowToJsonLd = () => {
  const { t, te } = useI18n();
  const { siteUrl } = useRuntimeConfig().public;
  const path = useRequestURL().pathname;

  useJsonLd(() => {
    const steps = howSteps(t, te);
    if (steps.length < 2) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      '@id': fragmentId(siteUrl, path, 'how'),
      name: t('landing.how.title'),
      description: t('landing.how.subtitle'),
      step: steps.map((step) => ({ '@type': 'HowToStep', name: step.name, text: step.text })),
    };
  });
};

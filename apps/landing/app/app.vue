<script setup lang="ts">
const { locale, localeProperties } = useI18n();
const { siteUrl } = useRuntimeConfig().public;
const requestUrl = useRequestURL();

// @nuxtjs/i18n v10 does not inject hreflang/canonical on its own: the head object has
// to be produced here and applied once at the root, so every page inherits it.
const localeHead = useLocaleHead({ dir: false, meta: false });
// `definePageMeta` is read from the route record, which exists before any component
// renders; state set by the page would be too late, because the layout renders first.
const route = useRoute();
const ownsCluster = computed(() => Boolean((route.meta as { seoAlternates?: boolean }).seoAlternates));
useHead(() =>
  // A page that builds its own hreflang cluster from database data gets the generated
  // one switched off; only the `<html lang>` from it is still wanted.
  ownsCluster.value ? { htmlAttrs: localeHead.value.htmlAttrs } : localeHead.value,
);

useHead(() => ({
  link:
    locale.value === 'uk'
      ? // The Cyrillic subset is only preloaded where it is actually rendered: on the
        // other locales it would cost 14 KB of first-paint bytes for unused glyphs.
        [{ rel: 'preload', href: '/fonts/manrope-cyrillic.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' }]
      : [],
}));

useSeoMeta({
  ogSiteName: 'Constella',
  ogImage: `${siteUrl}/og/default.png`,
  twitterCard: 'summary_large_image',
  ogUrl: () => `${siteUrl}${requestUrl.pathname}`.replace(/\/$/, '') || siteUrl,
  // Facebook wants the underscore form (de_DE), the i18n config carries BCP 47 (de-DE).
  ogLocale: () => (localeProperties.value?.language ?? 'uk_UA').replace('-', '_'),
});

// Entity markup has to be present in the prerendered HTML, and only the root knows
// the site-wide facts; pages add their own (BlogPosting, CollectionPage) on top.
useJsonLd(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'Constella',
      url: siteUrl,
      logo: { '@type': 'ImageObject', url: `${siteUrl}/icon.svg` },
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'Constella',
      inLanguage: ['uk-UA', 'en-US', 'de-DE', 'fr-FR'],
      publisher: { '@id': `${siteUrl}/#organization` },
    },
  ],
}));
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

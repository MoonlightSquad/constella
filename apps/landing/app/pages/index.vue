<script setup lang="ts">
const { t } = useI18n();
const { siteUrl } = useRuntimeConfig().public;

useSeoMeta({
  title: () => t('meta.home.title'),
  description: () => t('meta.home.desc'),
  ogTitle: () => t('meta.home.ogTitle'),
  ogDescription: () => t('meta.home.desc'),
  ogType: 'website',
  ogImage: `${siteUrl}/og/default.png`,
  twitterCard: 'summary_large_image',
});

// Лише тут: обидві секції рендеряться на цій сторінці, а пререндерені чотири її корені,
// тож розмітка потрапляє в статичний HTML і не залежить від гідратації.
useLandingFaqJsonLd();
useLandingHowToJsonLd();
</script>

<template>
  <div>
    <LandingHero />
    <LandingAi />
    <LandingFeatures />
    <LandingHow />
    <LandingPricing />
    <LandingPlatforms />
    <LandingFaq />
    <LandingBlogTeaser />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ page: 'privacy' | 'terms' | 'community' }>();

const { t, tm } = useI18n();
const { siteUrl } = useRuntimeConfig().public;
const titleKey = `meta.legal.${props.page}`;
const descKey = `${titleKey}Desc`;

const sections = computed(() => (tm(`legal.${props.page}`) ?? []) as Array<{ h: string, p: string }>);

useSeoMeta({
  title: () => t(titleKey),
  description: () => t(descKey),
  ogTitle: () => t(titleKey),
  ogDescription: () => t(descKey),
  ogType: 'article',
  ogImage: `${siteUrl}/og/default.png`,
  twitterCard: 'summary_large_image',
});
</script>

<template>
  <section class="section shell">
    <div class="prose">
      <p class="eyebrow">Constella</p>
      <h1 class="section-title">{{ t(titleKey) }}</h1>
      <p class="note">{{ t('legal.note') }}</p>

      <article v-for="(s, i) in sections" :key="i">
        <h2>{{ s.h }}</h2>
        <p>{{ s.p }}</p>
      </article>
    </div>
  </section>
</template>

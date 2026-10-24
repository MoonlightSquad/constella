<script setup lang="ts">
import type { NuxtError } from '#app';

const props = defineProps<{ error: NuxtError }>();

const { t } = useI18n();
const localePath = useLocalePath();

const isNotFound = computed(() => props.error?.statusCode === 404);
const title = computed(() => t(isNotFound.value ? 'common.notFound' : 'common.errorTitle'));
const hint = computed(() => t(isNotFound.value ? 'common.notFoundHint' : 'common.errorHint'));

useSeoMeta({
  title: () => `${title.value} — Constella`,
  description: () => hint.value,
  robots: 'noindex',
});
</script>

<template>
  <NuxtLayout>
    <section class="section shell">
      <p class="eyebrow">{{ isNotFound ? '404' : (error?.statusCode ?? 500) }}</p>
      <h1 class="section-title">{{ title }}</h1>
      <p class="section-sub">{{ hint }}</p>
      <p class="hero__cta">
        <NuxtLink class="btn btn-gold" :to="localePath('/')">{{ t('common.backHome') }}</NuxtLink>
      </p>
    </section>
  </NuxtLayout>
</template>

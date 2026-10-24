<script setup lang="ts">
import type { BlogPostSummary } from '~/types/blog';

const { t, locale, localeProperties } = useI18n();
const localePath = useLocalePath();

// The home page is prerendered, so this reflects the posts published at build time;
// /blog itself is always rendered on demand.
const { data } = await useFetch<{ items: BlogPostSummary[] }>('/api/blog/posts', {
  query: computed(() => ({ locale: locale.value, limit: 3 })),
});

const language = computed(() => localeProperties.value?.language ?? 'uk-UA');
</script>

<template>
  <section id="blog" class="section shell">
    <div class="section-head">
      <p class="eyebrow">{{ $t('landing.nav.blog') }}</p>
      <h2 class="section-title">{{ $t('blog.teaserTitle') }}</h2>
      <p class="section-sub">{{ $t('blog.teaserSubtitle') }}</p>
    </div>

    <div v-if="data?.items.length" class="teaser-grid">
      <article v-for="post in data.items" :key="post.id" class="teaser">
        <h3><NuxtLink :to="localePath(`/blog/${post.slug}`)">{{ post.title }}</NuxtLink></h3>
        <p>{{ post.excerpt }}</p>
        <p class="teaser__meta">
          <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ formatDate(post.publishedAt, language) }}</time>
          <span aria-hidden="true">·</span>
          <span>{{ post.readingMinutes }} {{ $t('blog.minutes') }}</span>
        </p>
      </article>
    </div>
    <p v-else class="teaser teaser--empty">{{ $t('blog.empty') }}</p>

    <p class="section__cta">
      <NuxtLink class="btn btn-ghost" :to="localePath('/blog')">{{ $t('blog.teaserCta') }}</NuxtLink>
    </p>
  </section>
</template>

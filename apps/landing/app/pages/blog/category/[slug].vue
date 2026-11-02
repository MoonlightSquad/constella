<script setup lang="ts">
import type { BlogCategoryArchive } from '~/types/blog';
import { useBlogArchive, usePagedArchivePosts } from '~/composables/useBlogArchive';

// Кластер alternates для архіву задає термін, а не префікс URL (як у перекладених статей).
definePageMeta({ seoAlternates: true });

const { t, locale, localeProperties } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ''));

const { data: term } = await useFetch<BlogCategoryArchive>('/api/blog/category', {
  query: computed(() => ({ slug: slug.value, locale: locale.value })),
});
if (!term.value) throw createError({ statusCode: 404, statusMessage: t('common.notFound') });

const { items, nextCursor, loading, loadMore } = await usePagedArchivePosts(computed(() => ({ category: slug.value })));
const { crumbs } = useBlogArchive('category', term.value, items);

const language = computed(() => localeProperties.value?.language ?? 'uk-UA');
</script>

<template>
  <div class="section shell">
    <div class="section-head">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="section-title">{{ term?.name }}</h1>
      <p v-if="term?.description" class="section-sub">{{ term.description }}</p>
    </div>

    <div v-if="items.length" class="posts">
      <article v-for="post in items" :key="post.id" class="post-card">
        <NuxtLink :to="localePath(`/blog/${post.slug}`)" class="post-card__cover">
          <img
            v-if="post.coverUrl"
            :src="post.coverUrl"
            :alt="post.coverAlt ?? ''"
            loading="lazy"
            decoding="async"
            width="1200"
            height="630"
          >
          <span v-else class="post-card__placeholder" aria-hidden="true"><BrandMark :size="46" /></span>
        </NuxtLink>
        <h2 class="post-card__title">
          <NuxtLink :to="localePath(`/blog/${post.slug}`)">{{ post.title }}</NuxtLink>
        </h2>
        <p class="post-card__excerpt">{{ post.excerpt }}</p>
        <p class="post-card__meta">
          <time v-if="post.publishedAt" :datetime="post.publishedAt">{{ formatDate(post.publishedAt, language) }}</time>
          <span aria-hidden="true">·</span>
          <span>{{ post.readingMinutes }} {{ $t('blog.minutes') }}</span>
        </p>
      </article>
    </div>

    <p v-else class="teaser teaser--empty">{{ $t('blog.empty') }}</p>

    <div class="posts__foot">
      <button v-if="nextCursor" class="btn btn-ghost" type="button" :disabled="loading" @click="loadMore">
        {{ $t('blog.loadMore') }}
      </button>
      <NuxtLink class="posts__feed" :to="localePath('/blog')">{{ $t('blog.backToBlog') }}</NuxtLink>
    </div>
  </div>
</template>

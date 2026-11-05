<script setup lang="ts">
import type { BlogAuthorRow, BlogCategory, BlogPostSummary, BlogTag } from '~/types/blog';

type BlogList = { items: BlogPostSummary[]; nextCursor: string | null };

const PAGE_SIZE = 12;
const { t, locale, localeProperties } = useI18n();
const route = useRoute();
const localePath = useLocalePath();
const { siteUrl } = useRuntimeConfig().public;
const searchInput = ref(typeof route.query.q === 'string' ? route.query.q : '');
const searchQuery = computed(() => {
  const query = typeof route.query.q === 'string' ? route.query.q.trim().slice(0, 80) : '';
  return query.length >= 2 ? query : '';
});
watch(() => route.query.q, (value) => {
  searchInput.value = typeof value === 'string' ? value : '';
});

const submitSearch = async () => {
  const query = searchInput.value.trim().slice(0, 80);
  if (query.length === 1) return;
  await navigateTo({
    path: route.path,
    query: query.length >= 2 ? { q: query } : {},
  });
};

// Server-to-server read through nitro: the browser never talks to the API, so the
// production CORS allowlist (single origin) never applies to it.
const { data: firstPage, error: listError } = await useFetch<BlogList>('/api/blog/posts', {
  query: computed(() => ({ locale: locale.value, limit: PAGE_SIZE, search: searchQuery.value || undefined })),
});
// Порожня головна блогу, згенерована під час відмови, — це сторінка, яку пошук запам'ятає
// як «блог порожній». Список ніколи не відповідає 404, тому тут лише 502 і ретрай.
if (listError.value) throwBlogUnavailable(listError.value, { notFound: t('common.notFound'), unavailable: t('common.errorTitle') });
const older = ref<BlogList[]>([]);
watch(firstPage, () => { older.value = []; });

const items = computed(() => [...(firstPage.value?.items ?? []), ...older.value.flatMap((page) => page.items)]);
const nextCursor = computed(() =>
  older.value.length ? older.value.at(-1)?.nextCursor ?? null : firstPage.value?.nextCursor ?? null,
);

const { data: categoryRows } = await useFetch<{ items: BlogCategory[] }>('/api/blog/categories', {
  query: computed(() => ({ locale: locale.value })),
});
const { data: tagRows } = await useFetch<{ items: BlogTag[] }>('/api/blog/tags', {
  query: computed(() => ({ locale: locale.value })),
});
const { data: authorRows } = await useFetch<{ items: BlogAuthorRow[] }>('/api/blog/authors', {
  query: computed(() => ({ locale: locale.value })),
});

const authorShelfLabel = computed(() => ({ uk: 'Автори', en: 'Authors', de: 'Autoren', fr: 'Auteurs' }[locale.value] ?? 'Authors'));

const loading = ref(false);
const loadMore = async () => {
  if (!nextCursor.value || loading.value) return;
  loading.value = true;
  try {
    older.value.push(await $fetch<BlogList>('/api/blog/posts', {
      query: { locale: locale.value, limit: PAGE_SIZE, cursor: nextCursor.value, search: searchQuery.value || undefined },
    }));
  } finally {
    loading.value = false;
  }
};

const headline = computed(() => t('meta.blog.title'));
useSeoMeta({
  title: () => headline.value,
  description: () => t('meta.blog.desc'),
  ogTitle: () => headline.value,
  ogDescription: () => t('meta.blog.desc'),
  ogType: 'website',
  ogImage: `${siteUrl}/og/default.png`,
  twitterCard: 'summary_large_image',
});

useJsonLd(() => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: t('meta.blog.title'),
  url: `${siteUrl}${route.path}`,
  description: t('meta.blog.desc'),
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: items.value.length,
    itemListElement: items.value.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${siteUrl}${localePath(`/blog/${item.slug}`)}`,
      name: item.title,
    })),
  },
}));

const language = computed(() => localeProperties.value?.language ?? 'uk-UA');
</script>

<template>
  <div class="section shell">
    <div class="section-head">
      <p class="eyebrow">Constella</p>
      <h1 class="section-title">{{ $t('blog.title') }}</h1>
      <p class="section-sub">{{ $t('blog.subtitle') }}</p>
    </div>

    <form class="blog-search" role="search" @submit.prevent="submitSearch">
      <label class="sr-only" for="blog-search">{{ $t('blog.searchLabel') }}</label>
      <input
        id="blog-search"
        v-model="searchInput"
        class="blog-search__input"
        type="search"
        name="q"
        minlength="2"
        maxlength="80"
        :placeholder="$t('blog.searchPlaceholder')"
      >
      <button class="btn btn-ghost" type="submit">{{ $t('blog.searchSubmit') }}</button>
      <button v-if="searchQuery" class="blog-search__clear" type="button" @click="searchInput = ''; submitSearch()">
        {{ $t('blog.searchClear') }}
      </button>
    </form>

    <div v-if="categoryRows?.items.length" class="tag-row" role="navigation" :aria-label="$t('blog.categories')">
      <NuxtLink
        v-for="row in categoryRows.items"
        :key="row.id"
        class="tag"
        :to="localePath(`/blog/category/${row.slug}`)"
      >
        {{ row.name }}
      </NuxtLink>
    </div>

    <div v-if="tagRows?.items.length" class="tag-row" role="navigation" :aria-label="$t('blog.topics')">
      <NuxtLink
        v-for="row in tagRows.items"
        :key="row.id"
        class="tag"
        :to="localePath(`/blog/tag/${row.slug}`)"
      >
        #{{ row.name }}
      </NuxtLink>
    </div>

    <div v-if="authorRows?.items.length" class="tag-row" role="navigation" :aria-label="authorShelfLabel">
      <NuxtLink
        v-for="row in authorRows.items"
        :key="row.id"
        class="tag"
        :to="localePath(`/blog/author/${row.slug}`)"
      >
        {{ row.name }}<span v-if="row.role"> · {{ row.role }}</span>
      </NuxtLink>
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

    <p v-else class="teaser teaser--empty">{{ searchQuery ? $t('blog.searchEmpty') : $t('blog.empty') }}</p>

    <div class="posts__foot">
      <button v-if="nextCursor" class="btn btn-ghost" type="button" :disabled="loading" @click="loadMore">
        {{ $t('blog.loadMore') }}
      </button>
      <a class="posts__feed" :href="`/feed/${locale}.xml`">{{ $t('blog.rss') }}</a>
    </div>
  </div>
</template>

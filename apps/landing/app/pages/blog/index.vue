<script setup lang="ts">
import type { BlogPostSummary } from '~/types/blog';

type BlogList = { items: BlogPostSummary[]; nextCursor: string | null };

const PAGE_SIZE = 12;
const { t, locale, localeProperties } = useI18n();
const route = useRoute();
const localePath = useLocalePath();
const { siteUrl } = useRuntimeConfig().public;

const tag = computed(() => (typeof route.query.tag === 'string' ? route.query.tag : ''));

// Server-to-server read through nitro, so the browser never needs API access.
const first = await useFetch<BlogList>('/api/blog/posts', {
  query: computed(() => ({ locale: locale.value, tag: tag.value, limit: PAGE_SIZE })),
});
const older = ref<BlogList[]>([]);
watch(first.data, () => { older.value = []; });

const items = computed(() => [...(first.data.value?.items ?? []), ...older.value.flatMap((page) => page.items)]);
const nextCursor = computed(() =>
  older.value.length ? older.value.at(-1)?.nextCursor ?? null : first.data.value?.nextCursor ?? null,
);

const { data: tagRows } = await useFetch<{ items: { tag: string; count: number }[] }>('/api/blog/tags', {
  query: computed(() => ({ locale: locale.value })),
});

const loading = ref(false);
const loadMore = async () => {
  if (!nextCursor.value || loading.value) return;
  loading.value = true;
  try {
    older.value.push(await $fetch<BlogList>('/api/blog/posts', {
      query: { locale: locale.value, tag: tag.value, limit: PAGE_SIZE, cursor: nextCursor.value },
    }));
  } finally {
    loading.value = false;
  }
};

const headline = computed(() => (tag.value ? `${t('meta.blog.title')} · ${tag.value}` : t('meta.blog.title')));
useSeoMeta({
  title: () => headline.value,
  description: () => t('meta.blog.desc'),
  ogTitle: () => headline.value,
  ogDescription: () => t('meta.blog.desc'),
  ogType: 'website',
  ogImage: `${siteUrl}/og/default.png`,
  twitterCard: 'summary_large_image',
});

useHead(() => ({
  link: [{ rel: 'alternate', type: 'application/rss+xml', title: t('blog.rss'), href: `${siteUrl}/feed/${locale.value}.xml` }],
}));

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

    <div v-if="tagRows?.items.length" class="tag-row" role="navigation" :aria-label="$t('blog.topics')">
      <NuxtLink class="tag" :class="{ 'tag--active': !tag }" :to="localePath('/blog')">
        {{ $t('blog.allTopics') }}
      </NuxtLink>
      <NuxtLink
        v-for="row in tagRows.items"
        :key="row.tag"
        class="tag"
        :class="{ 'tag--active': tag === row.tag }"
        :to="{ path: localePath('/blog'), query: { tag: row.tag } }"
        rel="nofollow"
      >
        {{ row.tag }}
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

    <p v-else class="teaser teaser--empty">{{ $t('blog.empty') }}</p>

    <div class="posts__foot">
      <button v-if="nextCursor" class="btn btn-ghost" type="button" :disabled="loading" @click="loadMore">
        {{ $t('blog.loadMore') }}
      </button>
      <a class="posts__feed" :href="`/feed/${locale}.xml`">{{ $t('blog.rss') }}</a>
    </div>
  </div>
</template>

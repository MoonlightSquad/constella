<script setup lang="ts">
import type { BlogCategoryArchive } from '~/types/blog';
import { useBlogArchive, usePagedArchivePosts } from '~/composables/useBlogArchive';

// Кластер alternates для архіву задає термін, а не префікс URL (як у перекладених статей).
definePageMeta({ seoAlternates: true });

const { t, locale, localeProperties } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ''));

const { data: term, error: termError } = await useFetch<BlogCategoryArchive>('/api/blog/category', {
  query: computed(() => ({ slug: slug.value, locale: locale.value })),
});
// Порожні дані ще не означають «сторінки немає»: 404 з індексу прибирає URL назавжди,
// тому статус береться з відповіді апстриму, а не з факту відсутності рядка.
if (!term.value) throwBlogUnavailable(termError.value, { notFound: t('common.notFound'), unavailable: t('common.errorTitle') });

const { items, nextCursor, loading, loadMore } = await usePagedArchivePosts(
  computed(() => ({ category: slug.value, exclude: term.value?.pinnedPost?.groupId ?? '' })),
);
const { crumbs } = useBlogArchive('category', term.value, items);

// Pillar — та сама стаття, що й у сітці, тому сітка просить API виключити її групу:
// без `exclude` один заголовок лежав би на сторінці двічі з різними текстами посилання.
const pinned = computed(() => term.value?.pinnedPost ?? null);

const language = computed(() => localeProperties.value?.language ?? 'uk-UA');
</script>

<template>
  <div class="section shell">
    <div class="section-head">
      <Breadcrumbs :crumbs="crumbs" />
      <h1 class="section-title">{{ term?.name }}</h1>
      <p v-if="term?.description" class="section-sub">{{ term.description }}</p>
    </div>

    <article v-if="pinned" class="pillar">
      <NuxtLink :to="localePath(`/blog/${pinned.slug}`)" class="post-card__cover pillar__cover">
        <img
          v-if="pinned.coverUrl"
          :src="pinned.coverUrl"
          :alt="pinned.coverAlt ?? ''"
          loading="lazy"
          decoding="async"
          width="1200"
          height="630"
        >
        <span v-else class="post-card__placeholder" aria-hidden="true"><BrandMark :size="46" /></span>
      </NuxtLink>
      <div class="pillar__body">
        <p class="eyebrow">{{ $t('blog.pillar') }}</p>
        <h2 class="pillar__title">
          <NuxtLink :to="localePath(`/blog/${pinned.slug}`)">{{ pinned.title }}</NuxtLink>
        </h2>
        <p class="pillar__excerpt">{{ pinned.excerpt }}</p>
        <p class="pillar__meta">
          <time v-if="pinned.publishedAt" :datetime="pinned.publishedAt">{{ formatDate(pinned.publishedAt, language) }}</time>
          <span aria-hidden="true">·</span>
          <span>{{ pinned.readingMinutes }} {{ $t('blog.minutes') }}</span>
        </p>
      </div>
    </article>

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

<script setup lang="ts">
import type { BlogAuthorArchive } from '~/types/blog';
import { useBlogArchive, usePagedArchivePosts } from '~/composables/useBlogArchive';

// Кластер alternates для профілю задає автор, а не префікс URL: slug у кожній мові свій.
definePageMeta({ seoAlternates: true });

const { t, locale, localeProperties } = useI18n();
const localePath = useLocalePath();
const route = useRoute();
const { siteUrl } = useRuntimeConfig().public;
const slug = computed(() => String(route.params.slug ?? ''));

const { data: term, error: termError } = await useFetch<BlogAuthorArchive>('/api/blog/author', {
  query: computed(() => ({ slug: slug.value, locale: locale.value })),
});
// Профіль, перейменований у CMS, справді 404; профіль, який база не віддала, — ні.
if (!term.value) throwBlogUnavailable(termError.value, { notFound: t('common.notFound'), unavailable: t('common.errorTitle') });

const { items, nextCursor, loading, loadMore } = await usePagedArchivePosts(computed(() => ({ author: slug.value })));
const { crumbs } = useBlogArchive('author', term.value, items);

const language = computed(() => localeProperties.value?.language ?? 'uk-UA');

// Host з URL профілю — єдиний підпис, який не треба перекладати й тримати в чотирьох
// словниках: читач впізнає t.me чи linkedin.com і так.
const profileLabel = (href: string) => {
  try {
    return new URL(href).host.replace(/^www\./, '');
  } catch {
    return href;
  }
};

const canonical = computed(() => `${siteUrl}${route.path}`);
// `#person` — та сама адреса, яку стаття цього автора ставить у свого `author.@id`:
// два документи описують одну сутність, а не двох різних людей.
const personId = computed(() => `${canonical.value}#person`);

useJsonLd(() => {
  if (!term.value) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${canonical.value}#profile`,
    url: canonical.value,
    name: term.value.seoTitle || term.value.name,
    inLanguage: language.value,
    mainEntity: {
      '@type': 'Person',
      '@id': personId.value,
      name: term.value.name,
      url: canonical.value,
      ...(term.value.role ? { jobTitle: term.value.role } : {}),
      ...(term.value.bio ? { description: term.value.bio } : {}),
      ...(term.value.avatarUrl ? { image: term.value.avatarUrl } : {}),
      ...(term.value.sameAs?.length ? { sameAs: term.value.sameAs } : {}),
    },
  };
});
</script>

<template>
  <div class="section shell">
    <Breadcrumbs :crumbs="crumbs" />

    <section class="author">
      <img
        v-if="term?.avatarUrl"
        class="author__avatar"
        :src="term.avatarUrl"
        :alt="term.avatarAlt ?? ''"
        width="88"
        height="88"
        decoding="async"
      >
      <div class="author__body">
        <h1 class="section-title">{{ term?.name }}</h1>
        <p v-if="term?.role" class="author__role">{{ term.role }}</p>
        <p v-if="term?.bio" class="author__bio">{{ term.bio }}</p>
        <p v-if="term?.sameAs?.length" class="author__links">
          <a
            v-for="profile in term.sameAs"
            :key="profile"
            :href="profile"
            rel="me noopener noreferrer"
            target="_blank"
          >{{ profileLabel(profile) }}</a>
        </p>
      </div>
    </section>

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

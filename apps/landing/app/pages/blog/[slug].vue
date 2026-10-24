<script setup lang="ts">
import type { BlogLocale, BlogPost } from '~/types/blog';

// The cluster of alternate links for a post comes from the database, not from the URL
// prefix, so this page claims it (see useSeoAlternates and app.vue).
definePageMeta({ seoAlternates: true });

const { t, locale, localeProperties, locales } = useI18n();
const route = useRoute();
const localePath = useLocalePath();
const { declare: declareAlternates } = useSeoAlternates();
const { siteUrl } = useRuntimeConfig().public;

const slug = computed(() => String(route.params.slug ?? ''));
const { data: post } = await useFetch<BlogPost>('/api/blog/post', {
  query: computed(() => ({ slug: slug.value, locale: locale.value })),
});

if (!post.value) throw createError({ statusCode: 404, statusMessage: t('common.notFound') });

const translations = computed(() => post.value?.alternates ?? []);
/** `/blog/<slug>` is the default locale; the other three carry their prefix. */
const localePathFor = (target: BlogLocale, value: string) =>
  `${target === 'uk' ? '' : `/${target}`}/blog/${value}`;

// A translated post has a different slug per language, so the language switcher and
// this page's own hreflang cluster are spelled out per locale rather than derived from
// the current path, which would advertise /fr/blog/<english-slug> — a URL that 404s.
declareAlternates(translations.value.map((item) => ({ locale: item.locale, path: localePathFor(item.locale, item.slug) })));

const language = computed(() => localeProperties.value?.language ?? 'uk-UA');
/** Region-qualified, exactly as the module writes the rest of the site into the sitemap. */
const hreflangOf = (code: BlogLocale) => locales.value.find((item) => item.code === code)?.language ?? code;
const headline = computed(() => post.value?.seoTitle || post.value?.title || '');
const summary = computed(() => post.value?.seoDescription || post.value?.excerpt || '');
const canonical = computed(() => post.value?.canonicalUrl || `${siteUrl}${route.path}`);
const picture = computed(() => post.value?.ogImageUrl || post.value?.coverUrl || `${siteUrl}/og/default.png`);
const primary = computed(() => translations.value.find((item) => item.locale === 'uk') ?? translations.value[0]);

useSeoMeta({
  title: () => headline.value,
  description: () => summary.value,
  ogTitle: () => headline.value,
  ogDescription: () => summary.value,
  ogType: 'article',
  ogImage: () => picture.value,
  ogUrl: () => canonical.value,
  articlePublishedTime: () => post.value?.publishedAt ?? undefined,
  articleModifiedTime: () => post.value?.updatedAt ?? undefined,
  twitterCard: 'summary_large_image',
  // Set by the editor for posts that must not grow an index entry (syndicated, seasonal).
  robots: () => (post.value?.noindex ? 'noindex' : undefined),
});

useHead(() => ({
  link: [
    ...(primary.value ? [{ rel: 'alternate', hreflang: 'x-default', href: `${siteUrl}${localePathFor(primary.value.locale, primary.value.slug)}` }] : []),
    ...translations.value.map((item) => ({ rel: 'alternate', hreflang: hreflangOf(item.locale), href: `${siteUrl}${localePathFor(item.locale, item.slug)}` })),
    { rel: 'canonical', href: canonical.value },
  ],
}));

useJsonLd(() => {
  if (!post.value) return null;
  const url = `${siteUrl}${route.path}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': url,
    headline: headline.value,
    description: summary.value,
    image: picture.value,
    inLanguage: language.value,
    datePublished: post.value.publishedAt ?? undefined,
    dateModified: post.value.updatedAt,
    articleSection: post.value.tags,
    author: { '@type': 'Person', name: post.value.authorName },
    publisher: {
      '@type': 'Organization',
      name: 'Constella',
      url: siteUrl,
      logo: { '@type': 'ImageObject', url: `${siteUrl}/icon.svg` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    // The siblings are the same post in another language, so they are the only
    // translation claim Google can verify against the hreflang cluster above.
    workTranslation: translations.value
      .filter((item) => item.locale !== locale.value)
      .map((item) => ({
        '@type': 'CreativeWork',
        inLanguage: hreflangOf(item.locale),
        url: `${siteUrl}${localePathFor(item.locale, item.slug)}`,
      })),
  };
});

const contents = computed(() => post.value?.toc ?? []);
const showContents = computed(() => contents.value.length >= 3);
</script>

<template>
  <article class="section shell">
    <header class="post-head">
      <NuxtLink class="post-head__back" :to="localePath('/blog')">
        ← {{ $t('blog.backToBlog') }}
      </NuxtLink>
      <h1 class="section-title">{{ post?.title }}</h1>
      <p class="post-head__meta">
        <time v-if="post?.publishedAt" :datetime="post.publishedAt">{{ formatDate(post.publishedAt, language) }}</time>
        <span aria-hidden="true">·</span>
        <span>{{ post?.readingMinutes }} {{ $t('blog.minutes') }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ post?.authorName }}</span>
      </p>
      <p v-if="post?.excerpt" class="post-head__excerpt">{{ post.excerpt }}</p>
      <img
        v-if="post?.coverUrl"
        class="post-head__cover"
        :src="post.coverUrl"
        :alt="post.coverAlt ?? ''"
        width="1200"
        height="630"
        fetchpriority="high"
        decoding="async"
      >
    </header>

    <nav v-if="showContents" class="toc" :aria-label="$t('blog.toc')">
      <p class="toc__title">{{ $t('blog.toc') }}</p>
      <ol>
        <li v-for="entry in contents" :key="entry.id" :class="`toc__l${entry.level}`">
          <a :href="`#${entry.id}`">{{ entry.text }}</a>
        </li>
      </ol>
    </nav>

    <!-- Rendered on the server with markdown-it html:false: raw HTML in a post body is
         escaped there, so this is the only place markup is trusted. -->
    <div class="prose" v-html="post?.html" />

    <footer class="post-foot">
      <ul v-if="post?.tags.length" class="tag-row">
        <li v-for="tag in post.tags" :key="tag">
          <NuxtLink class="tag" :to="{ path: localePath('/blog'), query: { tag } }">{{ tag }}</NuxtLink>
        </li>
      </ul>
      <NuxtLink class="btn btn-ghost" :to="localePath('/blog')">{{ $t('blog.backToBlog') }}</NuxtLink>
    </footer>
  </article>
</template>

<script setup lang="ts">
import type { BlogCategory } from '~/types/blog';

const { bot } = useSiteLinks();
const localePath = useLocalePath();
const { locale } = useI18n();

// `/api/blog/categories` swallows an unreachable upstream as an empty list, so a prerendered
// page bakes a footer without categories instead of failing the build.
const { data: categories } = await useFetch<{ items: BlogCategory[] }>('/api/blog/categories', {
  query: computed(() => ({ locale: locale.value })),
  default: () => ({ items: [] }),
});
// Upstream sorts by published-post count, so this is the fattest section of the archive.
const topCategories = computed(() => (categories.value?.items ?? []).slice(0, 4));
</script>

<template>
  <footer class="site-footer">
    <div class="shell">
      <div class="site-footer__grid">
        <div class="site-footer__brand">
          <p class="brand">
            <BrandMark :size="22" />
            <span>Constella</span>
          </p>
          <p class="site-footer__desc">{{ $t('landing.footer.brandDesc') }}</p>
        </div>

        <nav class="site-footer__links" :aria-label="$t('landing.nav.blog')">
          <a :href="bot" rel="noopener noreferrer">{{ $t('landing.nav.openBot') }}</a>
          <a :href="localePath('/blog')">{{ $t('landing.nav.blog') }}</a>
          <a :href="localePath('/') + '#pricing'">{{ $t('landing.nav.pricing') }}</a>
        </nav>

        <nav v-if="topCategories.length" class="site-footer__cats" :aria-label="$t('blog.categories')">
          <NuxtLink v-for="category in topCategories" :key="category.id" :to="localePath(`/blog/category/${category.slug}`)">
            {{ category.name }}
          </NuxtLink>
        </nav>

        <NewsletterForm class="site-footer__news" placement="footer" />
      </div>

      <div class="site-footer__legal">
        <NuxtLinkLocale to="/legal/privacy">{{ $t('landing.footer.privacy') }}</NuxtLinkLocale>
        <NuxtLinkLocale to="/legal/terms">{{ $t('landing.footer.terms') }}</NuxtLinkLocale>
        <NuxtLinkLocale to="/legal/community">{{ $t('landing.footer.community') }}</NuxtLinkLocale>
        <NuxtLinkLocale to="/security">{{ $t('meta.security.linkLabel') }}</NuxtLinkLocale>
        <a :href="bot" rel="noopener noreferrer">{{ $t('landing.footer.support') }}</a>
      </div>

      <div class="site-footer__legal">
        <span class="site-footer__adult">{{ $t('landing.footer.legal18') }}</span>
        <span>© {{ new Date().getFullYear() }} Constella. {{ $t('landing.footer.rights') }}</span>
      </div>
    </div>
  </footer>
</template>

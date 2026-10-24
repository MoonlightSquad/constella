<script setup lang="ts">
const { bot } = useSiteLinks();
const localePath = useLocalePath();
// Anchors have to point at the localized home page, otherwise clicking them
// from /blog jumps to a section that does not exist on the current page.
const home = localePath('/');
</script>

<template>
  <header class="site-header">
    <div class="shell site-header__row">
      <NuxtLinkLocale to="/" class="brand">
        <BrandMark :size="22" />
        <span>Constella</span>
      </NuxtLinkLocale>

      <nav class="site-nav" aria-label="Constella">
        <a :href="`${home}#features`">{{ $t('landing.nav.features') }}</a>
        <a :href="`${home}#ai`">{{ $t('landing.nav.ai') }}</a>
        <a :href="`${home}#pricing`">{{ $t('landing.nav.pricing') }}</a>
        <a :href="localePath('/blog')">{{ $t('landing.nav.blog') }}</a>
        <a :href="`${home}#download`">{{ $t('landing.nav.download') }}</a>
        <a :href="`${home}#faq`">{{ $t('landing.nav.faq') }}</a>
      </nav>

      <div class="header__cta">
        <LocaleSwitcher />
        <a class="btn btn-gold" :href="bot" rel="noopener noreferrer">
          {{ $t('landing.nav.launchApp') }}
        </a>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
const { bot } = useSiteLinks();
const localePath = useLocalePath();
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

        <nav class="site-footer__links" :aria-label="$t('landing.nav.faq')">
          <a :href="bot" rel="noopener noreferrer">{{ $t('landing.nav.openBot') }}</a>
          <a :href="localePath('/blog')">{{ $t('landing.nav.blog') }}</a>
          <a :href="localePath('/') + '#pricing'">{{ $t('landing.nav.pricing') }}</a>
        </nav>
      </div>

      <div class="site-footer__legal">
        <NuxtLinkLocale to="/legal/privacy">{{ $t('landing.footer.privacy') }}</NuxtLinkLocale>
        <NuxtLinkLocale to="/legal/terms">{{ $t('landing.footer.terms') }}</NuxtLinkLocale>
        <NuxtLinkLocale to="/legal/community">{{ $t('landing.footer.community') }}</NuxtLinkLocale>
        <a :href="bot" rel="noopener noreferrer">{{ $t('landing.footer.support') }}</a>
      </div>

      <div class="site-footer__legal">
        <span class="site-footer__adult">{{ $t('landing.footer.legal18') }}</span>
        <span>© {{ new Date().getFullYear() }} Constella. {{ $t('landing.footer.rights') }}</span>
      </div>
    </div>
  </footer>
</template>

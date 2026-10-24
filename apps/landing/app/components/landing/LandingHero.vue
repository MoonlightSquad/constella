<script setup lang="ts">
const { bot, appUrl } = useSiteLinks();
</script>

<template>
  <section class="hero shell">
    <div class="hero__inner">
      <p class="eyebrow">{{ $t('landing.hero.badge') }}</p>

      <h1 class="hero__title">
        {{ $t('landing.hero.title1') }}
        <span class="grad">{{ $t('landing.hero.titleGradient') }}</span>
        {{ $t('landing.hero.title2') }}
      </h1>

      <p class="hero__sub">{{ $t('landing.hero.subtitle') }}</p>

      <div class="hero__cta">
        <a class="btn btn-gold" :href="bot" rel="noopener noreferrer">{{ $t('landing.hero.ctaTg') }}</a>
        <a class="btn btn-ghost" :href="appUrl" rel="noopener noreferrer">{{ $t('landing.hero.ctaWeb') }}</a>
      </div>

      <p class="hero__trust">{{ $t('landing.hero.trustBadge') }}</p>

      <ul class="hero__facts">
        <li v-for="n in 3" :key="n" class="fact">{{ $t(`landing.hero.statsFact${n}`) }}</li>
      </ul>
    </div>
  </section>
</template>

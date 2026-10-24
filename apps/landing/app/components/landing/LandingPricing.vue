<script setup lang="ts">
import { VIP_STARS } from '~/utils/pricing';

const { bot } = useSiteLinks();
// vipFeat1 was the AI assistant and vipFeat6 a weekly free boost; neither ships,
// so the list below is the verified VIP surface from STAR_PRODUCTS.vip.
const vipFeatures = ['vipFeat2', 'vipFeat3', 'vipFeat4', 'vipFeat5'];
</script>

<template>
  <section id="pricing" class="section shell reveal">
    <div class="section-head is-center">
      <p class="eyebrow">{{ $t('landing.pricing.badge') }}</p>
      <h2 class="section-title">{{ $t('landing.pricing.title') }}</h2>
      <p class="section-sub">{{ $t('landing.pricing.subtitle') }}</p>
    </div>

    <div class="plans">
      <article class="plan">
        <h3 class="plan__name">{{ $t('landing.pricing.freeTitle') }}</h3>
        <p class="plan__price">
          {{ $t('landing.pricing.freePrice') }}
          <small>{{ $t('landing.pricing.freePeriod') }}</small>
        </p>
        <ul class="plan__list">
          <li v-for="n in 4" :key="n">{{ $t(`landing.pricing.freeFeat${n}`) }}</li>
        </ul>
        <div class="plan__cta">
          <a class="btn btn-ghost btn-block" :href="bot" rel="noopener noreferrer">{{ $t('landing.pricing.freeCta') }}</a>
        </div>
      </article>

      <article class="plan plan--vip">
        <span class="chip plan__badge">{{ $t('landing.pricing.vipBadge') }}</span>
        <h3 class="plan__name">{{ $t('landing.pricing.vipTitle') }}</h3>
        <p class="plan__price">
          {{ VIP_STARS }}★
          <small>{{ $t('landing.pricing.vipPeriod') }}</small>
        </p>
        <ul class="plan__list">
          <li v-for="key in vipFeatures" :key="key">{{ $t(`landing.pricing.${key}`) }}</li>
        </ul>
        <div class="plan__cta">
          <a class="btn btn-gold btn-block" :href="bot" rel="noopener noreferrer">{{ $t('landing.pricing.vipCta') }}</a>
        </div>
      </article>
    </div>
  </section>
</template>

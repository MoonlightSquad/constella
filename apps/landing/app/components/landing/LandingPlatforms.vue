<script setup lang="ts">
const { bot, appUrl } = useSiteLinks();
const { show } = useInstallModal();
</script>

<template>
  <section id="download" class="section shell">
    <div class="section-head">
      <p class="eyebrow">{{ $t('landing.platforms.badge') }}</p>
      <h2 class="section-title">{{ $t('landing.platforms.title') }}</h2>
      <p class="section-sub">{{ $t('landing.platforms.subtitle') }}</p>
    </div>

    <div class="platforms">
      <article class="platform">
        <div class="platform__icon" aria-hidden="true">✈️</div>
        <h3 class="card__title">{{ $t('landing.platforms.tgTitle') }}</h3>
        <p class="card__desc">{{ $t('landing.platforms.tgDesc') }}</p>
        <div class="platform__actions">
          <a class="link-btn" :href="bot" rel="noopener noreferrer">{{ $t('landing.platforms.tgCta') }}</a>
        </div>
      </article>

      <article class="platform">
        <div class="platform__icon" aria-hidden="true">📱</div>
        <h3 class="card__title">{{ $t('landing.platforms.iosTitle') }}</h3>
        <p class="card__desc">{{ $t('landing.platforms.iosDesc') }}</p>
        <div class="platform__actions">
          <button class="link-btn" type="button" @click="show">{{ $t('landing.platforms.iosCta') }}</button>
        </div>
      </article>

      <article class="platform">
        <div class="platform__icon" aria-hidden="true">🤖</div>
        <h3 class="card__title">{{ $t('landing.platforms.androidTitle') }}</h3>
        <p class="card__desc">{{ $t('landing.platforms.androidDesc') }}</p>
        <div class="platform__actions">
          <button class="link-btn" type="button" @click="show">{{ $t('landing.platforms.androidCta') }}</button>
        </div>
      </article>

      <article class="platform">
        <div class="platform__icon" aria-hidden="true">💻</div>
        <h3 class="card__title">{{ $t('landing.platforms.webTitle') }}</h3>
        <p class="card__desc">{{ $t('landing.platforms.webDesc') }}</p>
        <div class="platform__actions">
          <a class="link-btn" :href="appUrl" rel="noopener noreferrer">{{ $t('landing.platforms.webCta') }}</a>
        </div>
      </article>
    </div>
  </section>
</template>

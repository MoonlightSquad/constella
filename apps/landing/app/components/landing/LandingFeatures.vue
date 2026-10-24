<script setup lang="ts">
const cards = [
  { icon: '🪐', title: 'landing.features.orbitTitle', desc: 'landing.features.orbitDesc' },
  { icon: '📍', title: 'landing.features.postgisTitle', desc: 'landing.features.postgisDesc' },
  { icon: '💬', title: 'landing.features.chatTitle', desc: 'landing.features.chatDesc' },
  { icon: '🎙️', title: 'landing.features.voiceTitle', desc: 'landing.features.voiceDesc' },
  { icon: '🛡️', title: 'landing.features.safeTitle', desc: 'landing.features.safeDesc' },
  { icon: '⭐', title: 'landing.features.starsTitle', desc: 'landing.features.starsDesc' },
];
</script>

<template>
  <section id="features" class="section shell reveal">
    <div class="section-head">
      <p class="eyebrow">{{ $t('landing.features.badge') }}</p>
      <h2 class="section-title">{{ $t('landing.features.title') }}</h2>
      <p class="section-sub">{{ $t('landing.features.subtitle') }}</p>
    </div>

    <div class="grid grid-3">
      <article v-for="card in cards" :key="card.title" class="card">
        <div class="card__icon" aria-hidden="true">{{ card.icon }}</div>
        <h3 class="card__title">{{ $t(card.title) }}</h3>
        <p class="card__desc">{{ $t(card.desc) }}</p>
      </article>
    </div>
  </section>
</template>

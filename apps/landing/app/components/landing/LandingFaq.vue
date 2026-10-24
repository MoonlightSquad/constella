<template>
  <section id="faq" class="section shell">
    <div class="section-head is-center">
      <p class="eyebrow">{{ $t('landing.faq.badge') }}</p>
      <h2 class="section-title">{{ $t('landing.faq.title') }}</h2>
      <p class="section-sub">{{ $t('landing.faq.subtitle') }}</p>
    </div>

    <div class="faq">
      <details v-for="n in 6" :key="n">
        <summary>{{ $t(`landing.faq.q${n}`) }}</summary>
        <p>{{ $t(`landing.faq.a${n}`) }}</p>
      </details>
    </div>
  </section>
</template>

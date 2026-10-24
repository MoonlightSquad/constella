<template>
  <section id="how" class="section shell">
    <div class="section-head is-center">
      <p class="eyebrow">{{ $t('landing.how.badge') }}</p>
      <h2 class="section-title">{{ $t('landing.how.title') }}</h2>
      <p class="section-sub">{{ $t('landing.how.subtitle') }}</p>
    </div>

    <div class="steps">
      <article v-for="n in 3" :key="n" class="step">
        <div class="step__num" aria-hidden="true">{{ $t(`landing.how.step${n}Num`) }}</div>
        <h3>{{ $t(`landing.how.step${n}Title`) }}</h3>
        <p>{{ $t(`landing.how.step${n}Desc`) }}</p>
      </article>
    </div>
  </section>
</template>

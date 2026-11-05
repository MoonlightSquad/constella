<script setup lang="ts">
const { t, te } = useI18n();
const steps = computed(() => howSteps(t, te));
</script>

<template>
  <section id="how" class="section shell">
    <div class="section-head is-center">
      <p class="eyebrow">{{ $t('landing.how.badge') }}</p>
      <h2 class="section-title">{{ $t('landing.how.title') }}</h2>
      <p class="section-sub">{{ $t('landing.how.subtitle') }}</p>
    </div>

    <div class="steps">
      <article v-for="(step, index) in steps" :key="index" class="step">
        <div class="step__num" aria-hidden="true">{{ step.num }}</div>
        <h3>{{ step.name }}</h3>
        <p>{{ step.text }}</p>
      </article>
    </div>
  </section>
</template>

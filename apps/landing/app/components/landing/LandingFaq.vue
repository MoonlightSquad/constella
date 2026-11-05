<script setup lang="ts">
const { t, te } = useI18n();
const items = computed(() => faqItems(t, te));
</script>

<template>
  <section id="faq" class="section shell">
    <div class="section-head is-center">
      <p class="eyebrow">{{ $t('landing.faq.badge') }}</p>
      <h2 class="section-title">{{ $t('landing.faq.title') }}</h2>
      <p class="section-sub">{{ $t('landing.faq.subtitle') }}</p>
    </div>

    <div class="faq">
      <details v-for="(item, index) in items" :key="index">
        <summary>{{ item.name }}</summary>
        <p>{{ item.text }}</p>
      </details>
    </div>
  </section>
</template>

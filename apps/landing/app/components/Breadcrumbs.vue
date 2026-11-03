<script setup lang="ts">
import type { Crumb } from '~/utils/json-ld';

// Архів кидає 404 до того, як встигає існувати `crumbs`, а сторінку помилки Vue все одно
// рендерує через цей шаблон. Порожній список — просто відсутня навігація; обов'язковий —
// попередження в консолі браузера й у логах SSR на кожному 404.
withDefaults(defineProps<{ crumbs?: Crumb[] }>(), { crumbs: () => [] });
</script>

<template>
  <nav v-if="crumbs.length > 1" class="crumbs" :aria-label="$t('blog.crumbs.aria')">
    <ol>
      <li v-for="(crumb, index) in crumbs" :key="index">
        <NuxtLink v-if="crumb.path" :to="crumb.path">{{ crumb.name }}</NuxtLink>
        <span v-else aria-current="page">{{ crumb.name }}</span>
      </li>
    </ol>
  </nav>
</template>

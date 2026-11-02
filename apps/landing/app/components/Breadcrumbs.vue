<script setup lang="ts">
import type { Crumb } from '~/utils/json-ld';

/** Шлях уже локалізований (localePath), тож остання крихта лишається без нього. */
defineProps<{ crumbs: Crumb[] }>();
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

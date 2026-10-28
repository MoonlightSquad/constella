<script setup lang="ts">
// Anything that is not the marketing site: never indexed, never in a sitemap.
useSeoMeta({ robots: 'noindex, nofollow' });
</script>

<template>
  <div class="adm-blank">
    <slot />
  </div>
</template>

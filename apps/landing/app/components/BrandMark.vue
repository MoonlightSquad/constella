<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 22 });
</script>

<template>
  <!-- Same mark as public/icon.svg, so logo, favicon and OG card agree. -->
  <svg class="brand__mark" :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <g :stroke-width="size < 32 ? 4 : 2.4" stroke="currentColor" stroke-opacity="0.6" fill="none" stroke-linecap="round">
      <path d="M18 16 L40 24 L26 40 L46 48" />
      <path d="M18 16 L26 40" />
    </g>
    <circle cx="18" cy="16" r="7" fill="currentColor" />
    <circle cx="40" cy="24" r="5" fill="currentColor" />
    <circle cx="26" cy="40" r="6" fill="var(--mint)" />
    <circle cx="46" cy="48" r="4.5" fill="currentColor" />
  </svg>
</template>

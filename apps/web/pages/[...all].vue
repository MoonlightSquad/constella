<script setup lang="ts">
// Fallback page so Vue Router always matches a route (auth/profile paths
// are rendered by app.vue itself, not through <NuxtPage>). Keeping this catch-all
// avoids "No match found" router warnings for those paths.
definePageMeta({ layout: false })
</script>

<template>
  <div />
</template>

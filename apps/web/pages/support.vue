<script setup lang="ts">
import { useDashboard } from '~/composables/useDashboard'

definePageMeta({ layout: 'dashboard' })
const dash = useDashboard()
const { goTab } = dash
</script>

<template>
  <section class="view sky-view"><SupportDesk @close="goTab('sky')" /></section>
</template>

<style scoped>
.view { width: min(100%, 720px); margin: 0 auto; }
</style>

<script setup lang="ts">
import { useDashboard } from '~/composables/useDashboard'

definePageMeta({ layout: 'dashboard' })
const dash = useDashboard()
const { matches, account, isLoading } = dash
const { showToast, refreshAll, openReport, goTab } = dash
</script>

<template>
  <DashboardChatPanel
    :matches="matches"
    :account="account"
    :is-loading="isLoading"
    @toast="showToast"
    @refresh="refreshAll"
    @report="openReport"
    @back-to-orbit="goTab('orbit')"
  />
</template>

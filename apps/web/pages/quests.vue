<script setup lang="ts">
import { useDashboard } from '~/composables/useDashboard'

definePageMeta({ layout: 'dashboard' })
const dash = useDashboard()
const { quests } = dash
const { completeInviteQuest, showToast } = dash
</script>

<template>
  <DashboardQuestsPanel :quests="quests" @invite="completeInviteQuest" @toast="showToast" />
</template>

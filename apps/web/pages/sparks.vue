<script setup lang="ts">
import { useDashboard } from '~/composables/useDashboard'

definePageMeta({ layout: 'dashboard' })
const dash = useDashboard()
const { incomingSparks, incomingLikes } = dash
const { goTab, likeIncomingProfile } = dash
</script>

<template>
  <DashboardSparksPanel
    :count="incomingSparks"
    :likes="incomingLikes"
    @view-orbit="goTab('orbit')"
    @view-vip="goTab('sky')"
    @like-back="likeIncomingProfile"
  />
</template>

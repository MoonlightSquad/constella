<script setup lang="ts">
import { useDashboard } from '~/composables/useDashboard'

definePageMeta({ layout: 'dashboard' })
const dash = useDashboard()
const { orbitProfiles, orbitRemaining, releasePending, isLoading, billingStatus, appliedOrbitFilters } = dash
const { reactToProfile, submitRecommendationFeedback, applyOrbitFilters, clearOrbitFilters, openReport, blockProfile, refreshAll, goTab } = dash
</script>

<template>
  <DashboardOrbitPanel
    :profiles="orbitProfiles"
    :orbit-remaining="orbitRemaining"
    :release-pending="releasePending"
    :is-loading="isLoading"
    :vip="!!billingStatus?.vip"
    :feedback-enabled="!appliedOrbitFilters || Object.keys(appliedOrbitFilters).length === 0"
    @react="reactToProfile"
    @feedback="submitRecommendationFeedback"
    @apply-filters="applyOrbitFilters"
    @clear-filters="clearOrbitFilters"
    @report="openReport"
    @block="blockProfile"
    @refresh="refreshAll"
    @view-vip="goTab('sky')"
  />
</template>

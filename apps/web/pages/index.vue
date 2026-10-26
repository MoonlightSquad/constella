<script setup lang="ts">
import { useDashboard } from '~/composables/useDashboard'

definePageMeta({ layout: 'dashboard' })
const dash = useDashboard()
const { orbitProfiles, orbitRemaining, releasePending, isLoading, billingStatus } = dash
const { reactToProfile, applyOrbitFilters, clearOrbitFilters, openReport, blockProfile, refreshAll, goTab } = dash
</script>

<template>
  <DashboardOrbitPanel
    :profiles="orbitProfiles"
    :orbit-remaining="orbitRemaining"
    :release-pending="releasePending"
    :is-loading="isLoading"
    :vip="!!billingStatus?.vip"
    @react="reactToProfile"
    @apply-filters="applyOrbitFilters"
    @clear-filters="clearOrbitFilters"
    @report="openReport"
    @block="blockProfile"
    @refresh="refreshAll"
    @view-vip="goTab('sky')"
  />
</template>

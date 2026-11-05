<script setup lang="ts">
import { onMounted } from 'vue'
import { useDashboard } from '~/composables/useDashboard'

definePageMeta({ layout: 'dashboard' })
const dash = useDashboard()
const { account, quests, billingStatus, isBuying, isLinkingTelegram, telegramLinkError, safetyReports, safetyReportsLoading } = dash
const { buyProduct, cancelVip, linkTelegramAccount, requestEditProfile, goTab, authActions } = dash

onMounted(() => { void dash.loadSafetyReports() })
const onLogout = () => authActions.value.logout?.()
const onDeleteAccount = () => authActions.value.deleteAccount?.()
</script>

<template>
  <DashboardProfilePanel
    :account="account"
    :quests="quests"
    :billing-status="billingStatus"
    :is-buying="isBuying"
    :is-linking-telegram="isLinkingTelegram"
    :telegram-link-error="telegramLinkError"
    :safety-reports="safetyReports"
    :safety-reports-loading="safetyReportsLoading"
    @buy-product="buyProduct"
    @cancel-vip="cancelVip"
    @link-telegram="linkTelegramAccount"
    @contact-support="navigateTo('/support')"
    @edit-profile="requestEditProfile"
    @logout="onLogout"
    @delete-account="onDeleteAccount"
    @back-to-orbit="goTab('orbit')"
  />
</template>

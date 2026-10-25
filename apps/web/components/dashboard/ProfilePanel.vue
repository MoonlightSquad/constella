<script setup lang="ts">
import { useLocale, type TranslationKey } from '~/composables/useLocale'

const props = defineProps<{
  account: Record<string, any>
  quests: { xp: number; level: number; achievements: any[]; daily: any[] } | null
  billingStatus: any
  isBuying: string | null
  isLinkingTelegram: boolean
  telegramLinkError: string
  isAdmin?: boolean
}>()

const emit = defineEmits<{
  buyProduct: [sku: string]
  cancelVip: []
  linkTelegram: [payload: Record<string, string | number | boolean>]
  contactSupport: []
  editProfile: []
  openAdmin: []
  logout: []
  deleteAccount: []
  backToOrbit: []
}>()

const runtimeConfig = useRuntimeConfig()
const { t } = useLocale()

const genderLabel = (gender: string) => t(({
  woman: 'profile.women', man: 'profile.men', nonbinary: 'profile.nonbinary', other: 'profile.other',
} as Record<string, TranslationKey>)[gender] || 'dashboard.notSet')
</script>

<template>
  <section class="view sky-view">
    <p class="eyebrow">{{ t('dashboard.profileEyebrow') }}</p>
    <div class="sky-heading">
      <div class="large-avatar">{{ account.profile?.city?.slice(0, 1)?.toUpperCase() || 'C' }}</div>
      <div><h1>{{ account.profile?.displayName || t('dashboard.profile') }}</h1><p>{{ account.profile?.city || t('dashboard.noCity') }} · {{ t('dashboard.level', { level: quests?.level ?? 1 }) }}</p></div>
    </div>
    <section class="sky-section"><h2>{{ t('dashboard.aboutMe') }}</h2><p>{{ account.profile?.bio || t('dashboard.addBio') }}</p></section>
    <section class="sky-section"><h2>{{ t('dashboard.lookingFor') }}</h2><p>{{ (account.profile?.lookingFor || []).map((gender: string) => genderLabel(gender)).join(', ') || t('dashboard.notSet') }}</p></section>
    <section class="sky-section"><h2>{{ t('dashboard.prompts') }}</h2><blockquote v-for="(prompt, index) in [account.profile?.promptOne, account.profile?.promptTwo, account.profile?.promptThree].filter(Boolean)" :key="index">{{ prompt }}</blockquote></section>
    <section class="sky-section premium-card">
      <h2>{{ t('dashboard.vipTitle') }}</h2>
      <div v-if="!billingStatus?.telegramAvailable" class="telegram-payment-link">
        <p>{{ t('dashboard.vipTelegramHint') }}</p>
        <TelegramAccountLink :bot-username="runtimeConfig.public.telegramBotUsername" :busy="isLinkingTelegram" :error="telegramLinkError" @authenticate="(p: any) => emit('linkTelegram', p)" />
      </div>
      <p v-if="billingStatus?.vip">{{ t('dashboard.vipActiveUntil') }} {{ billingStatus.entitlement?.expiresAt ? new Date(billingStatus.entitlement.expiresAt).toLocaleDateString() : '—' }}</p>
      <p v-if="billingStatus?.entitlement?.renews === false">{{ t('dashboard.vipRenewOff') }}</p>
      <button v-if="billingStatus?.vip && billingStatus?.entitlement?.renews" class="text-button" type="button" @click="emit('cancelVip')">{{ t('dashboard.vipCancelBtn') }}</button>
      <p v-else>{{ t('dashboard.vipFeatures') }}</p>
      <button v-if="!billingStatus?.vip" class="secondary-button wide-button" type="button" :disabled="isBuying !== null || !billingStatus?.telegramAvailable" @click="emit('buyProduct', 'vip')">
        {{ isBuying === 'vip' ? t('dashboard.preparingInvoice') : t('dashboard.buyWithStars') }}
      </button>
      <button v-else class="secondary-button wide-button" type="button" @click="emit('backToOrbit')">{{ t('dashboard.backToDating') }}</button>
    </section>
    <section class="sky-section">
      <h2>{{ t('dashboard.boostTitle') }}</h2>
      <p>{{ t('dashboard.boostPrices') }}</p>
      <div class="shop-actions">
        <button class="secondary-button" type="button" :disabled="isBuying !== null || !billingStatus?.telegramAvailable" @click="emit('buyProduct', 'boost')">{{ isBuying === 'boost' ? '…' : 'Boost · 100 ⭐' }}</button>
        <button class="secondary-button" type="button" :disabled="isBuying !== null || !billingStatus?.telegramAvailable" @click="emit('buyProduct', 'superlike')">{{ isBuying === 'superlike' ? '…' : `${t('dashboard.superlike')} · 25 ⭐ (${billingStatus?.superlikeBalance ?? 0})` }}</button>
        <button class="secondary-button" type="button" :disabled="isBuying !== null || !billingStatus?.telegramAvailable" @click="emit('buyProduct', 'freeze')">{{ isBuying === 'freeze' ? '…' : `${t('dashboard.freeze')} · 15 ⭐ (${billingStatus?.streakFreezes ?? 0})` }}</button>
      </div>
    </section>
    <button class="secondary-button wide-button" type="button" @click="emit('contactSupport')">{{ t('dashboard.contactSupport') }}</button>
    <button class="secondary-button wide-button" type="button" @click="emit('editProfile')">{{ t('dashboard.editProfile') }}</button>
    <button v-if="isAdmin" class="secondary-button wide-button" type="button" @click="emit('openAdmin')">{{ t('dashboard.openAdmin') }}</button>
    <button class="logout-button" type="button" @click="emit('logout')">{{ t('dashboard.logout') }}</button>
    <button class="delete-account" type="button" @click="emit('deleteAccount')">{{ t('dashboard.deleteAccount') }}</button>
  </section>
</template>

<style scoped>
.view { width: min(100%, 720px); margin: 0 auto; }
.eyebrow { margin: 0 0 10px; color: #85c9b9; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.sky-heading { display: flex; align-items: center; gap: 15px; margin: 24px 0; }
h1 { margin: 0; font-size: clamp(25px, 6vw, 34px); line-height: 1.12; }
.large-avatar { display: grid; width: 76px; height: 76px; flex: 0 0 auto; place-items: center; border: 1px solid #587169; border-radius: 50%; background: #24423d; color: #dbf0e6; font-size: 24px; font-weight: 700; }
.sky-heading h1 { font-size: 24px; }
.sky-heading p { margin: 5px 0 0; color: #91a19d; font-size: 12px; }
.sky-section { border-top: 1px solid #2b3c3d; padding: 16px 0; }
.sky-section h2 { margin: 0 0 9px; color: #e4b46c; font-size: 13px; }
.sky-section p, .sky-section blockquote { margin: 0; color: #c5d0cc; font-size: 13px; line-height: 1.55; }
.sky-section blockquote { margin-top: 8px; border-left: 2px solid #59897b; padding-left: 10px; }
.telegram-payment-link { display: grid; gap: 12px; margin: 12px 0; border: 1px solid #344748; border-radius: 9px; padding: 13px; background: #0d1718; }
.telegram-payment-link p { color: #aab9b6; font-size: 12px; }
.text-button { min-height: 44px; border: 0; background: none; color: #85c9b9; font-size: 13px; font-weight: 700; cursor: pointer; }
.secondary-button { border: 1px solid #658c80; min-height: 46px; border-radius: 8px; padding: 0 17px; background: #24423d; color: #d8eee5; font-size: 13px; font-weight: 700; }
.wide-button { width: 100%; margin-top: 8px; }
.shop-actions { display: grid; gap: 8px; margin-top: 12px; }
.delete-account { display: block; margin: 14px auto; border: 1px solid #874f4b; border-radius: 8px; background: transparent; color: #ff9c8f; padding: 10px 14px; font-size: 12px; }
.logout-button { display: block; margin: 16px auto; border: 0; background: transparent; color: #f29b8e; font-size: 12px; }
</style>

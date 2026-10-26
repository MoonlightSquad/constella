<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useLocale, type TranslationKey } from '~/composables/useLocale'
import { useDashboard } from '~/composables/useDashboard'

const { t } = useLocale()
const dash = useDashboard()
const { account, orbitDate, matches, toast, issue, activeTab, safetyTarget, reportReason, reportDetails } = dash

const tabList: { id: 'orbit' | 'sparks' | 'chats' | 'quests' | 'sky'; label: TranslationKey; symbol: string }[] = [
  { id: 'orbit', label: 'dashboard.orbit', symbol: '✦' },
  { id: 'sparks', label: 'dashboard.sparks', symbol: '♡' },
  { id: 'chats', label: 'dashboard.chats', symbol: '◌' },
  { id: 'quests', label: 'dashboard.quests', symbol: '☆' },
  { id: 'sky', label: 'dashboard.sky', symbol: '☾' },
]

onMounted(() => {
  void dash.refreshAll()
  window.addEventListener('focus', dash.refreshAfterBrowserPayment)
  document.addEventListener('visibilitychange', dash.refreshAfterBrowserPayment)
})
onUnmounted(() => {
  window.removeEventListener('focus', dash.refreshAfterBrowserPayment)
  document.removeEventListener('visibilitychange', dash.refreshAfterBrowserPayment)
})
</script>

<template>
  <div class="product-shell">
    <header class="topbar">
      <NuxtLink class="brand" to="/" @click.prevent="dash.goTab('orbit')">
        <span class="brand-mark">✦</span>
        <span>{{ t('dashboard.brand') }}</span>
      </NuxtLink>
      <div class="topbar-meta">
        <LanguageSwitcher />
        <span class="orbit-date">{{ orbitDate ? dash.formatOrbitDate(orbitDate) : t('dashboard.skyDate') }}</span>
        <button class="avatar-button" type="button" :aria-label="t('dashboard.profileAccessible')" @click="dash.goTab('sky')">
          {{ account?.profile?.city?.slice(0, 1)?.toUpperCase() || 'C' }}
        </button>
      </div>
    </header>

    <main class="main-content">
      <div v-if="issue" class="notice error-notice" role="alert">
        <span>{{ issue }}</span>
        <button type="button" @click="dash.refreshAll">{{ t('dashboard.retry') }}</button>
      </div>

      <slot />
    </main>

    <div v-if="toast" class="toast-floating" role="status">{{ toast }}</div>

    <div v-if="safetyTarget" class="modal-backdrop" @click.self="safetyTarget = null">
      <form class="report-dialog" @submit.prevent="dash.submitReport">
        <p class="eyebrow">{{ t('dashboard.reportEyebrow') }}</p>
        <h2>{{ t('dashboard.reportTitle', { name: safetyTarget.label }) }}</h2>
        <label class="field-label">{{ t('dashboard.reportReason') }}
          <select v-model="reportReason">
            <option value="spam">{{ t('dashboard.reasonSpam') }}</option>
            <option value="harassment">{{ t('dashboard.reasonHarassment') }}</option>
            <option value="fake_profile">{{ t('dashboard.reasonFake') }}</option>
            <option value="underage">{{ t('dashboard.reasonUnderage') }}</option>
            <option value="other">{{ t('dashboard.reasonOther') }}</option>
          </select>
        </label>
        <label class="field-label">{{ t('dashboard.reportDetails') }}
          <textarea v-model="reportDetails" maxlength="500" rows="3" :placeholder="t('dashboard.reportPlaceholder')" />
        </label>
        <div class="dialog-actions">
          <button class="cancel-button" type="button" @click="safetyTarget = null">{{ t('dashboard.cancel') }}</button>
          <button class="send-report" type="submit">{{ t('dashboard.sendReport') }}</button>
        </div>
      </form>
    </div>

    <nav class="tabbar" :aria-label="t('dashboard.navigation')">
      <button v-for="tab in tabList" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="dash.goTab(tab.id)">
        <span class="tab-symbol">{{ tab.symbol }}</span>
        <span>{{ t(tab.label) }}</span>
        <i v-if="tab.id === 'chats' && matches.length" class="tab-dot" />
      </button>
    </nav>
  </div>
</template>

<style scoped>
.product-shell { min-height: 100svh; padding-bottom: calc(82px + env(safe-area-inset-bottom)); background: radial-gradient(ellipse at 50% -20%, #1b3631 0%, #0d1718 54%); color: #f3f5f2; }
.topbar { position: sticky; z-index: 5; top: 0; display: flex; height: 62px; align-items: center; justify-content: space-between; padding: 0 max(20px, calc((100vw - 1040px) / 2)); border-bottom: 1px solid #263536; background: #0d1718ee; backdrop-filter: blur(16px); }
.brand { display: flex; align-items: center; gap: 9px; color: #f3f5f2; font-size: 18px; font-weight: 760; text-decoration: none; }
.brand-mark { color: #e4b46c; font-size: 21px; }
.topbar-meta { display: flex; align-items: center; gap: 14px; }
.orbit-date { color: #9aaba7; font-size: 12px; }
.avatar-button { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border: 1px solid #587169; border-radius: 50%; background: #24423d; color: #dbf0e6; font-weight: 700; cursor: pointer; }
.main-content { width: min(100%, 900px); min-height: calc(100svh - 144px); margin: 0 auto; padding: 34px 20px calc(96px + env(safe-area-inset-bottom)); }
.eyebrow { margin: 0 0 10px; color: #85c9b9; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.tabbar { position: fixed; z-index: 6; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(5, 1fr); min-height: calc(65px + env(safe-area-inset-bottom)); padding: 7px max(8px, calc((100vw - 620px) / 2)) env(safe-area-inset-bottom); border-top: 1px solid #2b3c3d; background: #101c1df5; backdrop-filter: blur(18px); }
.tabbar button { position: relative; display: grid; justify-items: center; align-content: center; gap: 3px; border: 0; background: transparent; color: #829390; font-size: 10px; cursor: pointer; }
.tabbar button.active { color: #d9b879; }
.tab-symbol { font-size: 18px; line-height: 1; }
.tab-dot { position: absolute; top: 7px; right: 24%; width: 5px; height: 5px; border-radius: 50%; background: #e4b46c; }
.notice { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; border: 1px solid; border-radius: 8px; padding: 11px 13px; font-size: 12px; }
.toast-floating { position: fixed; z-index: 20; top: 74px; left: 50%; transform: translateX(-50%); width: max-content; max-width: min(92vw, 460px); border: 1px solid #547d70; border-radius: 8px; padding: 11px 16px; background: #1d332ef2; color: #c7ebdd; font-size: 12px; text-align: center; box-shadow: 0 12px 32px #0007; }
.error-notice { border-color: #8e5148; background: #351f1d; color: #ffd0c8; }
.notice button { border: 0; background: transparent; color: inherit; font-weight: 700; cursor: pointer; padding: 15px 6px; margin: -15px -6px; }
.modal-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; place-items: center; padding: 18px; background: #071011cc; backdrop-filter: blur(6px); }
.report-dialog { width: min(100%, 420px); border: 1px solid #465a55; border-radius: 10px; padding: 21px; background: #142222; box-shadow: 0 24px 80px #0008; }
.report-dialog h2 { margin: 0 0 18px; font-size: 20px; }
.field-label { display: grid; gap: 7px; margin-bottom: 14px; color: #c9d5d1; font-size: 12px; }
.field-label select, .field-label textarea { width: 100%; border: 1px solid #344748; border-radius: 8px; padding: 11px; background: #0d1718; color: #f3f5f2; }
.field-label textarea { resize: vertical; }
.dialog-actions { display: flex; justify-content: end; gap: 8px; margin-top: 20px; }
.dialog-actions button { min-height: 40px; border-radius: 7px; padding: 0 11px; font-size: 11px; font-weight: 700; }
.cancel-button { border: 1px solid #475756; background: transparent; color: #c5d0cc; }
.send-report { border: 0; background: #d9ad6d; color: #18211e; }
@media (min-width: 760px) { .main-content { padding-top: 45px; } }
@media (max-width: 450px) { .main-content { padding: 23px 14px calc(96px + env(safe-area-inset-bottom)); } .topbar { padding: 0 15px; } .orbit-date { font-size: 10px; } }
</style>

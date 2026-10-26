<script setup lang="ts">
import { ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

const props = defineProps<{
  match: { id: string; profile: { id: string; displayName: string; age: number; city: string | null } | null }
  wsConnected: boolean
  contactInfo: { offeredByMe: boolean; mutual: boolean; usernames: string[] } | null
  isSharingContact: boolean
  notificationsEnabled: boolean
  callsAvailable?: boolean
}>()

const emit = defineEmits<{
  back: []
  startCall: [type: 'audio' | 'video']
  shareContact: []
  block: [profileId: string, matchId: string]
  report: [profile: any, matchId: string]
  refresh: []
  toggleNotifications: []
  reconnect: [matchId: string]
}>()

const { t } = useLocale()
const menuOpen = ref(false)
</script>

<template>
  <header class="chat-header">
    <button class="back-button" type="button" :aria-label="t('dashboard.allChats')" @click="emit('back')">←</button>
    <div class="mini-avatar">{{ match.profile?.city?.slice(0, 1)?.toUpperCase() || '✦' }}</div>
    <div class="chat-header-info">
      <h1>{{ match.profile?.displayName || t('dashboard.newMatch') }}</h1>
      <p>{{ match.profile?.age }} {{ t('dashboard.years') }} · {{ match.profile?.city }}</p>
    </div>
    <div class="chat-header-actions">
      <button v-if="callsAvailable" class="call-icon-button" type="button" :title="t('dashboard.audioCall')" @click="emit('startCall', 'audio')">📞</button>
      <button v-if="callsAvailable" class="call-icon-button" type="button" :title="t('dashboard.videoCall')" @click="emit('startCall', 'video')">📹</button>
      <button class="overflow-menu-btn" type="button" aria-label="Menu" @click="menuOpen = !menuOpen">⋮</button>
    </div>
    <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false"></div>
    <div v-if="menuOpen" class="chat-overflow-menu">
      <button class="menu-item" type="button" @click="wsConnected ? null : emit('reconnect', match.id); menuOpen = false">
        <span class="menu-dot" :class="{ 'menu-dot--on': wsConnected }"></span>
        {{ wsConnected ? t('dashboard.reconnected') : t('dashboard.connecting') }}
      </button>
      <button class="menu-item" type="button" @click="emit('toggleNotifications'); menuOpen = false">
        {{ notificationsEnabled ? '🔔' : '🔕' }} {{ notificationsEnabled ? t('dashboard.notificationsOn') : t('dashboard.notificationsOff') }}
      </button>
      <button v-if="contactInfo?.mutual" class="menu-item" type="button" disabled>
        ✈️ {{ contactInfo.usernames.map(u => `@${u}`).join(', ') }}
      </button>
      <button v-else-if="match.profile" class="menu-item" type="button" :disabled="isSharingContact || contactInfo?.offeredByMe" @click="emit('shareContact'); menuOpen = false">
        {{ contactInfo?.offeredByMe ? '✓ ' + t('dashboard.contactOffered') : '✈️ ' + t('dashboard.shareTelegram') }}
      </button>
      <button v-if="match.profile" class="menu-item menu-item--danger" type="button" @click="emit('report', match.profile, match.id); menuOpen = false">{{ t('dashboard.reportShort') }}</button>
      <button v-if="match.profile" class="menu-item menu-item--danger" type="button" @click="emit('block', match.profile.id, match.id); menuOpen = false">{{ t('dashboard.blockShort') }}</button>
      <button class="menu-item" type="button" @click="emit('refresh'); menuOpen = false">↻ {{ t('dashboard.refreshMessages') }}</button>
    </div>
  </header>
</template>

<style scoped>
.chat-header { position: relative; display: flex; align-items: center; gap: 11px; border-bottom: 1px solid #2b3c3d; padding: 13px; }
.chat-header-info { min-width: 0; flex: 1; }
.chat-header-info h1 { margin: 0; font-size: 16px; }
.chat-header-info p { margin: 3px 0 0; color: #8c9b97; font-size: 11px; }
.chat-header-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; }
.chat-header-actions > button { min-height: 34px; }
.call-icon-button { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #364949; border-radius: 8px; background: #182828; color: #e4b46c; font-size: 14px; cursor: pointer; }
.overflow-menu-btn { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #364949; border-radius: 8px; background: transparent; color: #d6e1dd; font-size: 20px; cursor: pointer; }
.overflow-menu-btn:hover { background: #1e3030; }
.menu-backdrop { position: fixed; inset: 0; z-index: 99; }
.chat-overflow-menu { position: absolute; top: 100%; right: 8px; z-index: 100; min-width: 220px; border: 1px solid #2b3c3d; border-radius: 10px; background: #1a2e2e; box-shadow: 0 12px 40px #000000a0; padding: 6px 0; }
.menu-item { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; padding: 10px 14px; background: transparent; color: #d6e1dd; font-size: 14px; text-align: left; cursor: pointer; }
.menu-item:hover { background: #243a3a; }
.menu-item:disabled { opacity: .55; cursor: default; }
.menu-item--danger { color: #e88a8a; }
.menu-item--danger:hover { background: #2e1f1f; }
.menu-dot { width: 8px; height: 8px; border-radius: 50%; background: #5a6e6a; }
.menu-dot--on { background: #5eead4; }
.back-button { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border: 0; border-radius: 8px; background: transparent; color: #d6e1dd; font-size: 20px; cursor: pointer; }
.mini-avatar { display: grid; width: 46px; height: 46px; flex: 0 0 auto; place-items: center; border: 1px solid #587169; border-radius: 50%; background: #24423d; color: #dbf0e6; font-size: 16px; font-weight: 700; }
</style>

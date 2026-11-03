<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

/** Поля `toPublicProfile` (engine/core.ts), які приходять у `social.matches`. */
type PeerProfile = {
  id: string
  displayName: string
  age: number
  city: string | null
  bio?: string | null
  quote?: string | null
  photos?: string[]
  prompts?: string[]
  interests?: string[]
  verified?: boolean
  level?: number
}

const props = defineProps<{ profile: PeerProfile }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useLocale()
const photos = computed(() => props.profile.photos ?? [])
const prompts = computed(() => (props.profile.prompts ?? []).filter(Boolean))
const interests = computed(() => props.profile.interests ?? [])
const active = ref(0)
const shownPhoto = computed(() => photos.value[active.value] ?? null)

const step = (delta: number) => {
  if (photos.value.length < 2) return
  active.value = (active.value + delta + photos.value.length) % photos.value.length
}

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close')
  else if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="sheet-backdrop" @click="emit('close')">
    <article class="sheet-card" role="dialog" aria-modal="true" :aria-label="profile.displayName" @click.stop>
      <button class="sheet-close" type="button" :aria-label="t('dashboard.closeProfile')" @click="emit('close')">✕</button>
      <div class="sheet-photo">
        <img v-if="shownPhoto" :src="shownPhoto" :alt="profile.displayName" class="sheet-image">
        <div v-else class="sheet-placeholder">✦</div>
        <template v-if="photos.length > 1">
          <button class="photo-nav photo-nav--prev" type="button" aria-label="←" @click="step(-1)">‹</button>
          <button class="photo-nav photo-nav--next" type="button" aria-label="→" @click="step(1)">›</button>
          <div class="photo-dots">
            <button
              v-for="(photo, index) in photos"
              :key="photo"
              type="button"
              class="photo-dot"
              :class="{ active: index === active }"
              :aria-label="`${index + 1} / ${photos.length}`"
              @click="active = index"
            ></button>
          </div>
        </template>
      </div>
      <div class="sheet-body">
        <div class="sheet-title">
          <h2>{{ profile.displayName }}, {{ profile.age }}</h2>
          <span>{{ t('dashboard.years') }}</span>
        </div>
        <p class="sheet-meta">
          <span>{{ profile.city || t('dashboard.noCity') }}</span>
          <span v-if="profile.level" class="meta-chip">{{ t('dashboard.level', { level: profile.level }) }}</span>
          <span v-if="profile.verified" class="meta-chip meta-chip--verified">{{ t('dashboard.verified') }}</span>
        </p>
        <div v-if="interests.length" class="sheet-chips">
          <span v-for="interest in interests" :key="interest" class="chip">{{ interest }}</span>
        </div>
        <p v-if="profile.bio" class="sheet-bio">{{ profile.bio }}</p>
        <blockquote v-if="profile.quote" class="sheet-quote">{{ profile.quote }}</blockquote>
        <blockquote v-for="(prompt, index) in prompts" :key="index" class="sheet-prompt">{{ prompt }}</blockquote>
      </div>
    </article>
  </div>
</template>

<style scoped>
.sheet-backdrop { position: fixed; z-index: 300; inset: 0; display: grid; place-items: center; padding: 18px; background: #071011cc; backdrop-filter: blur(6px); }
.sheet-card { position: relative; overflow: auto; width: min(420px, 100%); max-height: min(86svh, 720px); border: 1px solid #314343; border-radius: 12px; background: #132122; }
.sheet-close { position: absolute; top: 10px; right: 10px; z-index: 2; display: grid; width: 36px; height: 36px; place-items: center; border: 1px solid #3d524f; border-radius: 50%; background: #071011a6; color: #dbe7e3; font-size: 15px; cursor: pointer; }
.sheet-photo { position: relative; display: grid; min-height: 300px; max-height: 56svh; aspect-ratio: 4 / 5; place-items: center; background: #243c38; }
.sheet-image { width: 100%; height: 100%; object-fit: cover; }
.sheet-placeholder { display: grid; width: 82px; height: 82px; place-items: center; border: 1px solid #9ab8a94a; border-radius: 50%; color: #e4b46c; font-size: 34px; }
.photo-nav { position: absolute; top: 50%; display: grid; width: 34px; height: 34px; transform: translateY(-50%); place-items: center; border: 1px solid #3d524f; border-radius: 50%; background: #071011a6; color: #e7efe9; font-size: 22px; line-height: 1; cursor: pointer; }
.photo-nav--prev { left: 10px; }
.photo-nav--next { right: 10px; }
.photo-dots { position: absolute; bottom: 10px; left: 50%; display: flex; gap: 6px; transform: translateX(-50%); }
.photo-dot { width: 8px; height: 8px; border: 0; border-radius: 50%; background: #ffffff66; cursor: pointer; }
.photo-dot.active { background: #e4b46c; }
.sheet-body { padding: 18px 20px 22px; }
.sheet-title { display: flex; align-items: baseline; gap: 7px; }
.sheet-title h2 { margin: 0; font-size: 24px; overflow-wrap: anywhere; }
.sheet-title span { color: #9aaba7; font-size: 12px; }
.sheet-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; color: #9aaba7; font-size: 11px; }
.meta-chip { border: 1px solid #3b5150; border-radius: 99px; padding: 3px 8px; color: #b7c6c2; font-size: 10px; }
.meta-chip--verified { border-color: #86cdbb; background: #142c28cc; color: #b5eadb; }
.sheet-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.chip { border: 1px solid #334545; border-radius: 99px; padding: 4px 10px; color: #d1dcd8; font-size: 11px; }
.sheet-bio { margin: 14px 0 0; color: #d1dcd8; line-height: 1.55; font-size: 13px; }
.sheet-quote { margin: 14px 0 0; border-left: 2px solid #85c9b9; padding-left: 12px; color: #cfe3dc; font-size: 12px; line-height: 1.5; }
.sheet-prompt { margin: 12px 0 0; border-left: 2px solid #d5a863; padding-left: 12px; color: #e3c99f; font-size: 13px; line-height: 1.5; }
</style>

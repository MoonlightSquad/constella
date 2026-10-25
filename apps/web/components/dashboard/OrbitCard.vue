<script setup lang="ts">
import { ref } from 'vue'
import { useLocale } from '~/composables/useLocale'

type Profile = { id: string; displayName: string; age: number; gender: string; city: string | null; bio: string | null; photos: string[]; prompts: string[]; verified: boolean }

const props = defineProps<{ profile: Profile }>()

const emit = defineEmits<{
  react: [kind: 'spark' | 'pass' | 'super']
  report: [profile: Profile]
  block: [profileId: string]
}>()

const { t } = useLocale()
const dragX = ref(0)
const dragY = ref(0)
const isDragging = ref(false)
let pointerStartX = 0
let pointerStartY = 0

const onPointerDown = (event: PointerEvent) => {
  pointerStartX = event.clientX
  pointerStartY = event.clientY
  isDragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

const onPointerMove = (event: PointerEvent) => {
  if (!isDragging.value) return
  dragX.value = event.clientX - pointerStartX
  dragY.value = event.clientY - pointerStartY
}

const onPointerUp = () => {
  if (!isDragging.value) return
  isDragging.value = false
  const x = dragX.value
  const y = dragY.value
  dragX.value = 0
  dragY.value = 0
  if (y < -100 && Math.abs(y) > Math.abs(x)) emit('react', 'super')
  else if (x > 100 && Math.abs(x) > Math.abs(y)) emit('react', 'spark')
  else if (x < -100 && Math.abs(x) > Math.abs(y)) emit('react', 'pass')
}
</script>

<template>
  <article class="profile-card" :class="{ dragging: isDragging }" :style="{ transform: `translate(${dragX}px, ${dragY}px) rotate(${dragX / 22}deg)` }">
    <div class="profile-photo" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <img v-if="profile.photos[0]" :src="profile.photos[0]" :alt="t('dashboard.verifiedProfile')" class="profile-image">
      <div v-else class="photo-placeholder"><span>✦</span></div>
      <div class="photo-label">
        <span class="profile-location">{{ profile.city || t('dashboard.noCity') }}</span>
        <span v-if="profile.verified" class="verified-badge">{{ t('dashboard.verified') }}</span>
      </div>
    </div>
    <div class="profile-copy">
      <div class="profile-name"><h2>{{ profile.displayName }}, {{ profile.age }}</h2><span>{{ t('dashboard.years') }}</span></div>
      <p class="profile-bio">{{ profile.bio }}</p>
      <blockquote v-for="(prompt, index) in profile.prompts" :key="index" class="prompt-line">"{{ prompt }}"</blockquote>
    </div>
    <div class="profile-actions">
      <button class="pass-button" type="button" :aria-label="t('dashboard.pass')" @click="emit('react', 'pass')">{{ t('dashboard.pass') }}</button>
      <button class="spark-button" type="button" @click="emit('react', 'spark')"><span>✦</span> {{ t('dashboard.sendSpark') }}</button>
      <button class="super-button" type="button" @click="emit('react', 'super')">★</button>
    </div>
    <div class="safety-actions">
      <button type="button" @click="emit('report', profile)">{{ t('dashboard.report') }}</button>
      <button type="button" @click="emit('block', profile.id)">{{ t('dashboard.block') }}</button>
    </div>
  </article>
</template>

<style scoped>
.profile-card { overflow: hidden; will-change: transform; transition: transform .22s ease; border: 1px solid #314343; border-radius: 10px; background: #132122; }
.profile-card.dragging { transition: none; }
.profile-photo { touch-action: pan-y; position: relative; display: grid; min-height: 300px; aspect-ratio: 1.48; place-items: center; background-color: #243c38; background-position: center 35%; background-size: cover; }
.profile-image { position: absolute; width: 100%; height: 100%; object-fit: cover; object-position: center 35%; }
.profile-photo::after { position: absolute; inset: 35% 0 0; background: linear-gradient(180deg, transparent, #0c1718aa); content: ''; pointer-events: none; }
.photo-placeholder { display: grid; width: 82px; height: 82px; place-items: center; border: 1px solid #9ab8a94a; border-radius: 50%; color: #e4b46c; font-size: 34px; }
.photo-label { position: absolute; right: 16px; bottom: 15px; left: 16px; display: flex; align-items: end; justify-content: space-between; gap: 10px; }
.profile-location { color: #f0f3ef; font-size: 13px; font-weight: 650; text-shadow: 0 1px 7px #000; }
.verified-badge { border: 1px solid #86cdbb; border-radius: 99px; padding: 5px 8px; background: #142c28cc; color: #b5eadb; font-size: 10px; }
.profile-copy { padding: 19px 21px 8px; }
.profile-name { display: flex; align-items: baseline; gap: 7px; }
.profile-name h2 { margin: 0; font-size: 28px; overflow-wrap: anywhere; }
.profile-name span { color: #9aaba7; font-size: 12px; }
.profile-bio { color: #d1dcd8; line-height: 1.55; }
.prompt-line { margin: 11px 0; border-left: 2px solid #d5a863; padding: 1px 0 1px 12px; color: #e3c99f; font-size: 13px; line-height: 1.5; }
.profile-actions { display: grid; grid-template-columns: .8fr 1.2fr .55fr; gap: 10px; padding: 14px 20px 20px; }
.profile-actions button { min-height: 46px; border-radius: 8px; font-size: 13px; font-weight: 700; }
.pass-button { border: 1px solid #425554; background: transparent; color: #bdcac6; }
.spark-button { border: 0; background: #e4b46c; color: #15201d; }
.spark-button span { margin-right: 6px; }
.super-button { border: 1px solid #9d815c; border-radius: 8px; background: #30291f; color: #e4b46c; font-size: 20px; }
.safety-actions { display: flex; justify-content: center; gap: 20px; padding: 0 12px 17px; }
.safety-actions button { min-height: 44px; border: 0; background: transparent; color: #9aa9a5; font-size: 10px; cursor: pointer; }
@media (min-width: 760px) { .profile-card { display: grid; grid-template-columns: 1.05fr .95fr; } .profile-photo { grid-row: span 2; min-height: 480px; aspect-ratio: auto; } .profile-copy { align-self: end; padding: 28px 24px 8px; } .profile-actions { align-self: start; } }
@media (max-width: 450px) { .profile-photo { min-height: 250px; } }
</style>

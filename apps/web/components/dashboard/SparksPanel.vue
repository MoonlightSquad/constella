<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '~/composables/useLocale'

type LikeProfile = { id: string; displayName: string; age: number; city: string | null; photos: string[] }

const props = defineProps<{
  count: number
  likes: { count: number; vip: boolean; profiles: LikeProfile[] } | null
}>()

defineEmits<{
  viewOrbit: []
  viewVip: []
  likeBack: [profileId: string]
}>()

const { t } = useLocale()
// `Math` is not exposed to templates, so the blurred teaser count is prepared here.
const teasers = computed(() => Array.from({ length: Math.min(props.count, 3) }, (_, index) => index))
</script>

<template>
  <section class="view">
    <p class="eyebrow">{{ t('dashboard.sparksEyebrow') }}</p>
    <div class="view-heading"><h1>{{ t('dashboard.sparks') }}</h1><span class="counter">{{ count }}</span></div>

    <div v-if="!count" class="unlocks-panel">
      <div class="spark-orbit">✦</div>
      <h2>{{ t('dashboard.sparkEmpty') }}</h2>
      <p>{{ t('dashboard.sparkHint') }}</p>
      <button class="secondary-button" type="button" @click="$emit('viewOrbit')">{{ t('dashboard.viewOrbit') }}</button>
    </div>

    <div v-else-if="!likes?.vip" class="unlocks-panel">
      <div class="spark-orbit">✦</div>
      <h2>{{ t('dashboard.sparkSomeone') }}</h2>
      <p>{{ t('dashboard.sparkCount', { count }) }}</p>
      <div class="lock-teasers" aria-hidden="true">
        <span v-for="n in teasers" :key="n" class="lock-teaser">?</span>
      </div>
      <div class="panel-actions">
        <button class="gold-button" type="button" @click="$emit('viewVip')">{{ t('dashboard.viewVip') }}</button>
        <button class="secondary-button" type="button" @click="$emit('viewOrbit')">{{ t('dashboard.viewOrbit') }}</button>
      </div>
    </div>

    <div v-else class="likes-list">
      <p class="likes-intro">{{ t('dashboard.likesIntro', { count }) }}</p>
      <article v-for="person in likes.profiles" :key="person.id" class="like-card">
        <img v-if="person.photos[0]" :src="person.photos[0]" :alt="t('dashboard.verifiedProfile')" class="like-avatar">
        <div v-else class="like-avatar like-avatar-empty">✦</div>
        <div class="like-copy">
          <strong>{{ person.displayName }} · {{ person.age }}</strong>
          <span>{{ person.city || '—' }}</span>
        </div>
        <button class="like-back" type="button" @click="$emit('likeBack', person.id)">{{ t('dashboard.likeBack') }}</button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.view { width: min(100%, 720px); margin: 0 auto; }
.eyebrow { margin: 0 0 10px; color: #85c9b9; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.view-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
h1 { margin: 0; font-size: clamp(25px, 6vw, 34px); line-height: 1.12; }
.counter { display: inline-flex; align-items: baseline; gap: 3px; padding: 7px 10px; border: 1px solid #334545; border-radius: 8px; color: #e7bd7e; font-size: 18px; font-weight: 700; }
.unlocks-panel { display: grid; min-height: 300px; justify-items: center; align-content: center; padding: 28px; border: 1px solid #2b3c3d; border-radius: 10px; background: #132122; text-align: center; }
.unlocks-panel h2 { margin: 13px 0 4px; color: #eff3ee; font-size: 20px; }
.unlocks-panel p { max-width: 400px; margin: 7px 0 15px; line-height: 1.55; }
.spark-orbit { display: grid; width: 78px; height: 78px; place-items: center; border: 1px solid #9d815c; border-radius: 50%; background: #30291f; color: #e4b46c; font-size: 30px; }
.secondary-button { border: 1px solid #658c80; min-height: 46px; border-radius: 8px; padding: 0 17px; background: #24423d; color: #d8eee5; font-size: 13px; font-weight: 700; cursor: pointer; }
.gold-button { border: 1px solid #d9ad6d; min-height: 46px; border-radius: 8px; padding: 0 17px; background: #d9ad6d; color: #15201d; font-size: 13px; font-weight: 750; cursor: pointer; }
.panel-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.lock-teasers { display: flex; gap: 10px; margin: 2px 0 16px; }
.lock-teaser { display: grid; width: 54px; height: 54px; place-items: center; border: 1px dashed #4a5c5c; border-radius: 50%; background: #1a2b2b; color: #7e918d; font-size: 20px; font-weight: 700; }
.likes-list { display: grid; gap: 10px; }
.likes-intro { margin: 0 2px 6px; color: #9fb4ad; font-size: 13px; line-height: 1.5; }
.like-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid #2b3c3d; border-radius: 10px; background: #132122; }
.like-avatar { width: 54px; height: 54px; flex: 0 0 auto; border-radius: 50%; object-fit: cover; background: #243c38; }
.like-avatar-empty { display: grid; place-items: center; color: #e4b46c; font-size: 20px; }
.like-copy { display: grid; gap: 2px; flex: 1; min-width: 0; }
.like-copy strong { color: #eff3ee; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.like-copy span { color: #87999a; font-size: 12px; }
.like-back { border: 1px solid #d9ad6d; min-height: 40px; border-radius: 8px; padding: 0 14px; background: transparent; color: #e4b46c; font-size: 12px; font-weight: 750; cursor: pointer; }
.like-back:hover { background: #d9ad6d; color: #15201d; }
</style>

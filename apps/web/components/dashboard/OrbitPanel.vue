<script setup lang="ts">
import { ref } from 'vue'
import { useLocale } from '~/composables/useLocale'
import OrbitCard from './OrbitCard.vue'

type Profile = { id: string; displayName: string; age: number; gender: string; city: string | null; bio: string | null; photos: string[]; prompts: string[]; verified: boolean }

const props = defineProps<{
  profiles: Profile[]
  orbitRemaining: number
  releasePending: boolean
  isLoading: boolean
  vip: boolean
}>()

const emit = defineEmits<{
  react: [kind: 'spark' | 'pass' | 'super']
  applyFilters: [filters: Record<string, string | number>]
  clearFilters: []
  report: [profile: Profile]
  block: [profileId: string]
  refresh: []
  viewVip: []
}>()

const { t } = useLocale()
const filterDraft = ref<{ minAge: number | ''; maxAge: number | ''; city: string; gender: string }>({ minAge: '', maxAge: '', city: '', gender: '' })
const hasAppliedFilters = ref(false)

const currentProfile = () => props.profiles[0] ?? null

const submitFilters = () => {
  const filters: Record<string, string | number> = {}
  if (filterDraft.value.minAge !== '') filters.minAge = Number(filterDraft.value.minAge)
  if (filterDraft.value.maxAge !== '') filters.maxAge = Number(filterDraft.value.maxAge)
  if (filterDraft.value.city.trim()) filters.city = filterDraft.value.city.trim()
  if (filterDraft.value.gender) filters.gender = filterDraft.value.gender
  hasAppliedFilters.value = Object.keys(filters).length > 0
  emit('applyFilters', filters)
}

const clearFilters = () => {
  filterDraft.value = { minAge: '', maxAge: '', city: '', gender: '' }
  hasAppliedFilters.value = false
  emit('clearFilters')
}
</script>

<template>
  <section class="view orbit-view">
    <form v-if="vip" class="orbit-filters" @submit.prevent="submitFilters">
      <div class="orbit-filter-heading">
        <div><strong>{{ t('dashboard.filtersVipTitle') }}</strong><small>{{ t('dashboard.filtersVipHint') }}</small></div>
        <button v-if="hasAppliedFilters" type="button" class="filter-reset" @click="clearFilters">{{ t('dashboard.filtersReset') }}</button>
      </div>
      <div class="orbit-filter-fields">
        <label>{{ t('dashboard.ageFrom') }}<input v-model.number="filterDraft.minAge" type="number" min="18" max="99" placeholder="18"></label>
        <label>{{ t('dashboard.ageTo') }}<input v-model.number="filterDraft.maxAge" type="number" min="18" max="99" placeholder="99"></label>
        <label>{{ t('dashboard.cityLabel') }}<input v-model="filterDraft.city" type="search" maxlength="80" :placeholder="t('dashboard.cityPlaceholder')"></label>
        <label>{{ t('dashboard.genderLabel') }}<select v-model="filterDraft.gender"><option value="">{{ t('dashboard.genderAll') }}</option><option value="woman">{{ t('dashboard.genderWoman') }}</option><option value="man">{{ t('dashboard.genderMan') }}</option><option value="nonbinary">{{ t('dashboard.genderNonbinary') }}</option><option value="other">{{ t('dashboard.genderOther') }}</option></select></label>
        <button class="filter-apply" type="submit">{{ t('dashboard.filtersApply') }}</button>
      </div>
    </form>
    <div v-else-if="!vip && profiles.length >= 0" class="orbit-filter-locked">
      <span>{{ t('dashboard.filtersLockedText') }}</span>
      <button type="button" @click="$emit('viewVip')">{{ t('dashboard.viewVip') }}</button>
    </div>

    <div class="view-heading">
      <div>
        <p class="eyebrow">{{ t('dashboard.orbitEyebrow') }}</p>
        <h1>{{ t('dashboard.orbitTitle') }}</h1>
      </div>
      <span class="counter">{{ orbitRemaining }} <small>/ 8</small></span>
    </div>

    <div v-if="isLoading" class="empty-state">{{ t('dashboard.loadingOrbit') }}</div>
    <OrbitCard v-else-if="currentProfile()" :profile="currentProfile()!" @react="(k) => $emit('react', k)" @report="(p) => $emit('report', p)" @block="(id) => $emit('block', id)" />
    <div v-else class="empty-state orbit-empty">
      <span class="empty-star">✦</span>
      <h2>{{ t(releasePending ? 'dashboard.releasePending' : 'dashboard.emptyOrbit') }}</h2>
      <p>{{ t(releasePending ? 'dashboard.releaseDescription' : 'dashboard.emptyOrbitDescription') }}</p>
      <button v-if="!releasePending" type="button" class="text-button" @click="$emit('refresh')">{{ t('dashboard.refreshOrbit') }}</button>
    </div>
    <p class="privacy-caption">{{ t('dashboard.dailyLimit') }}</p>
  </section>
</template>

<style scoped>
.view { width: min(100%, 720px); margin: 0 auto; }
.eyebrow { margin: 0 0 10px; color: #85c9b9; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
.view-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
h1 { margin: 0; font-size: clamp(25px, 6vw, 34px); line-height: 1.12; }
.counter { display: inline-flex; align-items: baseline; gap: 3px; padding: 7px 10px; border: 1px solid #334545; border-radius: 8px; color: #e7bd7e; font-size: 18px; font-weight: 700; }
.counter small { color: #879995; font-size: 11px; font-weight: 500; }
.orbit-filters { display: grid; gap: 13px; margin-bottom: 20px; border: 1px solid #334744; border-radius: 10px; padding: 14px; background: #12201f; }
.orbit-filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.orbit-filter-heading div { display: grid; gap: 4px; }
.orbit-filter-heading strong { color: #e4b46c; font-size: 13px; }
.orbit-filter-heading small { color: #9aaba7; font-size: 11px; }
.orbit-filter-fields { display: grid; grid-template-columns: .65fr .65fr 1.3fr 1fr auto; gap: 8px; align-items: end; }
.orbit-filter-fields label { display: grid; gap: 5px; color: #aab9b6; font-size: 10px; }
.orbit-filter-fields input,.orbit-filter-fields select { width: 100%; min-width: 0; border: 1px solid #344748; border-radius: 7px; padding: 9px; background: #0b1516; color: #f3f5f2; font: inherit; }
.filter-apply,.filter-reset,.orbit-filter-locked button { border: 1px solid #c89d60; border-radius: 7px; min-height: 44px; padding: 9px 12px; background: #d9ad6d; color: #18211e; font-size: 11px; font-weight: 700; cursor: pointer; }
.filter-reset { padding: 9px 10px; }
.orbit-filter-locked { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; border: 1px solid #334545; border-radius: 9px; padding: 12px; color: #aab9b6; font-size: 11px; }
.orbit-filter-locked button { flex: 0 0 auto; }
.empty-state { display: grid; min-height: 300px; align-content: center; justify-items: center; padding: 28px 22px; color: #a8b8b4; text-align: center; }
.empty-state h2 { margin: 13px 0 4px; color: #eff3ee; font-size: 20px; }
.empty-state p { max-width: 400px; margin: 7px 0 15px; line-height: 1.55; }
.empty-star { color: #e4b46c; font-size: 30px; }
.text-button { min-height: 44px; border: 0; background: none; color: #85c9b9; font-size: 13px; font-weight: 700; cursor: pointer; }
.privacy-caption { margin: 14px 0 0; color: #82928e; text-align: center; font-size: 11px; }
@media (max-width: 600px) { .orbit-filter-fields { grid-template-columns: 1fr 1fr; } .orbit-filter-fields label:nth-child(3),.orbit-filter-fields label:nth-child(4) { grid-column: span 2; } .filter-apply { grid-column: span 2; } }
</style>

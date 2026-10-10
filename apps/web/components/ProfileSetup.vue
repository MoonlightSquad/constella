<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useLocale, type TranslationKey } from '~/composables/useLocale'

const props = defineProps<{
  busy?: boolean
  canCancel?: boolean
  error?: string | null
  initial?: Record<string, any> | null
}>()

const emit = defineEmits<{
  save: [profile: Record<string, unknown>]
  cancel: []
}>()

const { t } = useLocale()
const validationError = ref('')

const genderOptions = [
  { value: 'woman', label: 'profile.women' as TranslationKey },
  { value: 'man', label: 'profile.men' as TranslationKey },
  { value: 'nonbinary', label: 'profile.nonbinary' as TranslationKey },
  { value: 'other', label: 'profile.other' as TranslationKey },
]

const form = reactive({
  birthdate: '',
  displayName: '',
  gender: 'woman',
  lookingFor: ['man'] as string[],
  city: '',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  acceptedTerms: false,
  bio: '',
  radiusKm: 50,
  promptOne: '',
  promptTwo: '',
  promptThree: '',
  photos: [] as string[],
})

watch(
  () => props.initial,
  (profile) => {
    if (!profile) return
    const data = profile.profile || profile
    form.birthdate = data.birthdate ? new Date(data.birthdate).toISOString().slice(0, 10) : ''
    form.displayName = data.displayName || ''
    form.gender = genderOptions.some((option) => option.value === data.gender)
      ? data.gender
      : 'woman'
    form.lookingFor = data.lookingFor?.length ? [...data.lookingFor] : ['man']
    form.city = data.city || ''
    form.timeZone = data.timeZone || form.timeZone
    form.acceptedTerms = Boolean(profile.onboardingComplete || data.termsAcceptedAt)
    form.bio = data.bio || ''
    form.radiusKm = data.preferredRadiusKm || 50
    form.promptOne = data.promptOne || ''
    form.promptTwo = data.promptTwo || ''
    form.promptThree = data.promptThree || ''
    form.photos = data.photos || []
  },
  { immediate: true }
)

watch(
  () => form.photos.length,
  () => {
    validationError.value = ''
  }
)

const latestBirthdate = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 18)
  return date.toISOString().slice(0, 10)
})

const toggleInterest = (value: string) => {
  form.lookingFor = form.lookingFor.includes(value)
    ? form.lookingFor.filter((item) => item !== value)
    : [...form.lookingFor, value]
  validationError.value = ''
}

const submit = () => {
  if (form.lookingFor.length === 0) {
    validationError.value = t('profile.requiredLookingFor')
    return
  }

  const photos = form.photos
  if (photos.length === 0) {
    validationError.value = t('profile.requiredPhoto')
    return
  }

  validationError.value = ''
  emit('save', {
    ...form,
    radiusKm: Number(form.radiusKm),
    photos,
  })
}
</script>

<template>
  <main class="profile-setup">
    <header class="setup-heading">
      <div class="heading-top">
        <p class="eyebrow">{{ t('profile.eyebrow') }}</p>
        <LanguageSwitcher />
      </div>
      <h1>{{ t(initial?.onboardingComplete ? 'profile.titleEdit' : 'profile.titleNew') }}</h1>
      <p>{{ t('profile.subtitle') }}</p>
      <button v-if="canCancel" class="cancel-edit" type="button" @click="emit('cancel')">{{ t('profile.cancel') }}</button>
    </header>

    <form class="setup-form" @submit.prevent="submit">
      <section class="form-section">
        <div class="section-title"><span>01</span><h2>{{ t('profile.about') }}</h2></div>
        <div class="field-grid">
          <label class="field">
            <span>{{ t('profile.name') }} <small>{{ t('profile.required') }}</small></span>
            <input v-model.trim="form.displayName" type="text" maxlength="40" autocomplete="given-name" required>
          </label>
          <label class="field">
            <span>{{ t('profile.birthdate') }} <small>{{ t('profile.age18') }} · {{ t('profile.required') }}</small></span>
            <input v-model="form.birthdate" type="date" :max="latestBirthdate" required>
          </label>
          <label class="field">
            <span>{{ t('profile.gender') }} <small>{{ t('profile.required') }}</small></span>
            <select v-model="form.gender" required>
              <option v-for="option in genderOptions" :key="option.value" :value="option.value">{{ t(option.label) }}</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>{{ t('profile.lookingFor') }} <small>{{ t('profile.required') }}</small></span>
          <div class="choice-list">
            <button
              v-for="option in genderOptions"
              :key="option.value"
              type="button"
              class="choice"
              :class="{ selected: form.lookingFor.includes(option.value) }"
              :disabled="!form.lookingFor.includes(option.value) && form.lookingFor.length >= 3"
              :aria-pressed="form.lookingFor.includes(option.value)"
              @click="toggleInterest(option.value)"
            >{{ t(option.label) }}</button>
          </div>
        </label>
        <div class="field-grid">
          <label class="field">
            <span>{{ t('profile.city') }} <small>{{ t('profile.required') }}</small></span>
            <input v-model.trim="form.city" type="text" maxlength="80" :placeholder="t('profile.cityPlaceholder')" autocomplete="address-level2" required>
          </label>
          <label class="field">
            <span>{{ t('profile.radius') }} <small>{{ form.radiusKm }} km · {{ t('profile.required') }}</small></span>
            <input v-model.number="form.radiusKm" type="range" min="10" max="250" step="10" required>
          </label>
        </div>
      </section>

      <section class="form-section">
        <div class="section-title"><span>02</span><h2>{{ t('profile.story') }}</h2></div>
        <label class="field">
          <span>{{ t('profile.bio') }}</span>
          <textarea v-model.trim="form.bio" maxlength="500" rows="3" :placeholder="t('profile.bioPlaceholder')" />
          <small>{{ form.bio.length }}/500</small>
        </label>
        <label class="field">
          <span>{{ t('profile.idealEvening') }}</span>
          <textarea v-model.trim="form.promptOne" maxlength="180" rows="2" :placeholder="t('profile.idealEveningPlaceholder')" />
        </label>
        <label class="field">
          <span>{{ t('profile.smallJoy') }}</span>
          <textarea v-model.trim="form.promptTwo" maxlength="180" rows="2" :placeholder="t('profile.smallJoyPlaceholder')" />
        </label>
        <label class="field">
          <span>{{ t('profile.talkAbout') }}</span>
          <textarea v-model.trim="form.promptThree" maxlength="180" rows="2" :placeholder="t('profile.talkPlaceholder')" />
        </label>
      </section>

      <label class="consent-row">
        <input v-model="form.acceptedTerms" type="checkbox">
        <span>{{ t('profile.consent') }}</span>
      </label>

      <section class="form-section">
        <div class="section-title"><span>03</span><h2>{{ t('profile.photos') }} <small>{{ t('profile.required') }}</small></h2></div>
        <PhotoUploader v-model="form.photos" />
      </section>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="validationError" class="form-error" role="alert">{{ validationError }}</p>
      <button class="submit-button" type="submit" :disabled="busy">
        {{ busy ? t('profile.saving') : t(initial?.onboardingComplete ? 'profile.save' : 'profile.openOrbit') }}
      </button>
      <p class="form-footnote">{{ t('profile.privacy') }}</p>
    </form>
  </main>
</template>

<style scoped>
.profile-setup { width: min(100%, 760px); margin: 0 auto; padding: 34px 20px 110px; color: #f5f7f6; }
.setup-heading { padding: 12px 0 30px; border-bottom: 1px solid #293a3b; }
.heading-top { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.eyebrow { margin: 0 0 13px; color: #82c7b7; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 0; font-size: clamp(28px, 7vw, 42px); line-height: 1.08; }
.setup-heading > p:last-child { max-width: 520px; margin: 12px 0 0; color: #aab9b6; line-height: 1.55; }
.cancel-edit { margin-top: 17px; border: 0; background: transparent; padding: 0; color: #82c7b7; font-size: 12px; }
.setup-form { display: grid; gap: 24px; padding-top: 26px; }
.form-section { display: grid; gap: 17px; }
.section-title { display: flex; align-items: center; gap: 12px; }
.section-title > span { color: #e4b46c; font-size: 12px; font-variant-numeric: tabular-nums; }
.section-title h2 { margin: 0; font-size: 19px; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.field { display: grid; gap: 8px; color: #d4dfdc; font-size: 13px; }
.field > span { display: flex; justify-content: space-between; gap: 10px; }
.field small { color: #8fa29f; font-size: 11px; font-weight: 400; }
.field input:not([type=range]), .field select, .field textarea { width: 100%; border: 1px solid #344748; border-radius: 8px; background: #122021; padding: 12px 13px; color: #f5f7f6; outline: none; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: #82c7b7; box-shadow: 0 0 0 2px #82c7b722; }
.field textarea { resize: vertical; }
.field input[type=range] { width: 100%; accent-color: #82c7b7; }
.choice-list { display: flex; flex-wrap: wrap; gap: 8px; }
.choice { border: 1px solid #344748; border-radius: 999px; padding: 9px 12px; background: transparent; color: #bdceca; font-size: 12px; }
.choice.selected { border-color: #82c7b7; background: #23413d; color: #e5f8f1; }
.choice:disabled { cursor: not-allowed; opacity: .45; }
.form-note, .form-footnote { margin: 0; color: #91a39f; font-size: 12px; line-height: 1.5; }
.consent-row { display: flex; align-items: start; gap: 10px; color: #bdcbc7; font-size: 12px; line-height: 1.5; }
.consent-row input { width: 17px; height: 17px; flex: 0 0 auto; margin: 1px 0 0; accent-color: #82c7b7; }
.form-error { margin: 0; color: #ff9c8f; font-size: 13px; }
.submit-button { width: 100%; min-height: 50px; border: 0; border-radius: 8px; background: #d9ad6d; color: #1b211f; font-weight: 750; }
.submit-button:disabled { cursor: wait; opacity: .6; }
@media (max-width: 560px) { .field-grid { grid-template-columns: 1fr; } .profile-setup { padding-right: 16px; padding-left: 16px; } }
</style>
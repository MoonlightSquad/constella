<script setup lang="ts">
import { useLocale } from '~/composables/useLocale'

const { locale, localeNames, setLocale, supportedLocales, t } = useLocale()

const changeLocale = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  if (supportedLocales.includes(value as typeof supportedLocales[number])) {
    setLocale(value as typeof supportedLocales[number])
  }
}
</script>

<template>
  <label class="language-switcher">
    <span>{{ t('language.label') }}</span>
    <select :value="locale" :aria-label="t('language.label')" @change="changeLocale">
      <option v-for="code in supportedLocales" :key="code" :value="code">{{ localeNames[code] }}</option>
    </select>
  </label>
</template>

<style scoped>
.language-switcher { display: inline-flex; align-items: center; gap: 7px; color: #9aaba7; font-size: 10px; }
.language-switcher select { max-width: 124px; border: 1px solid #3a504c; border-radius: 7px; padding: 6px 8px; background: #142222; color: #e5efeb; font-size: 11px; }
</style>

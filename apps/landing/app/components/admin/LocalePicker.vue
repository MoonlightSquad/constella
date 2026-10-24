<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';

const props = defineProps<{ modelValue: BlogLocale; locked?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [BlogLocale] }>();

const LOCALES: { code: BlogLocale; name: string }[] = [
  { code: 'uk', name: 'Українська' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
];

const pick = (code: BlogLocale) => {
  if (props.locked) return;
  emit('update:modelValue', code);
};
</script>

<template>
  <div class="adm__row" role="group" aria-label="Мова поста">
    <button
      v-for="item in LOCALES"
      :key="item.code"
      type="button"
      class="adm__chip"
      :class="{ 'adm__tab--on': modelValue === item.code }"
      :aria-pressed="modelValue === item.code"
      :disabled="locked"
      @click="pick(item.code)"
    >
      {{ item.name }}
    </button>
    <span v-if="locked" class="adm__hint">Мова поста не змінюється: для іншої створи переклад.</span>
  </div>
</template>

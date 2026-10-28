<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';

const { locales, locale } = useI18n();
const switchLocalePath = useSwitchLocalePath();
const { alternates } = useSeoAlternates();

// A blog post translated into two languages offers two, not four: the missing
// languages have no page here. The paths come from the post itself, because a
// localized slug cannot be derived from the current URL.
const options = computed(() => {
  const known = locales.value as unknown as Array<{ code: BlogLocale, name: string }>;
  const declared = alternates.value;
  if (!declared) return known.map((item) => ({ code: item.code, name: item.name }));
  return known.filter((item) => declared.some((entry) => entry.locale === item.code));
});

const onSwitch = (event: Event) => {
  const code = (event.target as HTMLSelectElement).value;
  if (code === locale.value) return;
  // switchLocalePath() returns an empty string when the current route is not localized
  // (/legal, nitro-generated feeds), so the bare locale root is the last resort.
  const generated = switchLocalePath(code);
  const target = alternates.value?.find((entry) => entry.locale === code)?.path ?? (generated || `/${code}`);
  navigateTo(target);
};
</script>

<template>
  <div class="locale-switch">
    <select :value="locale" :aria-label="$t('common.language')" @change="onSwitch">
      <option v-for="opt in options" :key="opt.code" :value="opt.code">{{ opt.name }}</option>
    </select>
  </div>
</template>

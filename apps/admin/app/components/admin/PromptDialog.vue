<script setup lang="ts">
const { state, close } = useAdminPrompt();
const field = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
// `v-model` on `<input type="number">` writes a number, so nothing here may assume a string.
const value = ref<string | number>('');

const request = computed(() => state.value.request);

watch(request, (next) => {
  value.value = next?.value ?? '';
  if (next) nextTick(() => field.value?.focus());
});

const text = computed(() => String(value.value ?? ''));

const invalid = computed(() => {
  const rules = request.value;
  if (!rules) return '';
  const length = text.value.trim().length;
  if (rules.minLength && length < rules.minLength) return `Мінімум ${rules.minLength} символи.`;
  if (rules.maxLength && length > rules.maxLength) return `Максимум ${rules.maxLength} символів.`;
  return '';
});

const kind = computed(() => request.value?.kind ?? 'text');

const submit = () => {
  if (!request.value || invalid.value) return;
  close(text.value.trim());
};

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && state.value.open) close(null);
};
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="state.open && request" class="adm__scrim" role="presentation" @click.self="close(null)">
    <form class="adm__dialog" role="dialog" aria-modal="true" :aria-label="request.title" @submit.prevent="submit">
      <h2>{{ request.title }}</h2>
      <label class="adm__field">
        <span class="adm__label">{{ request.label }}</span>
        <textarea
          v-if="kind === 'textarea'"
          ref="field"
          v-model="value"
          class="adm__area"
          :maxlength="request.maxLength"
          rows="4"
        />
        <input
          v-else
          ref="field"
          v-model="value"
          class="adm__input"
          :type="kind === 'number' ? 'number' : 'text'"
          :maxlength="request.maxLength"
          :min="kind === 'number' ? 1 : undefined"
        >
      </label>
      <p v-if="request.hint" class="adm__hint">{{ request.hint }}</p>
      <p v-if="invalid" class="adm__error">{{ invalid }}</p>
      <div class="adm__row adm__row--end">
        <button class="adm__btn" type="button" @click="close(null)">Скасувати</button>
        <button class="adm__btn adm__btn--gold" type="submit" :disabled="Boolean(invalid)">{{ request.danger ? 'Підтвердити' : 'Далі' }}</button>
      </div>
    </form>
  </div>
</template>

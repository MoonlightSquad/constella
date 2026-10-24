<script setup lang="ts">
const { open, hide } = useInstallModal();
const closeRef = ref<HTMLElement>();

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  closeRef.value?.focus();
});
</script>

<template>
  <div
    v-if="open"
    class="modal"
    role="dialog"
    aria-modal="true"
    :aria-label="$t('landing.modal.title')"
    @click.self="hide"
    @keydown.esc="hide"
  >
    <div class="modal__panel">
      <div class="modal__head">
        <h2>{{ $t('landing.modal.title') }}</h2>
        <button ref="closeRef" class="modal__close" type="button" :aria-label="$t('landing.modal.close')" @click="hide">
          ×
        </button>
      </div>
      <p class="section-sub">{{ $t('landing.modal.desc') }}</p>
      <ol>
        <li v-for="n in 3" :key="n">{{ $t(`landing.modal.pwaStep${n}`) }}</li>
      </ol>
      <div class="modal__actions">
        <button class="btn btn-ghost" type="button" @click="hide">{{ $t('landing.modal.close') }}</button>
      </div>
    </div>
  </div>
</template>

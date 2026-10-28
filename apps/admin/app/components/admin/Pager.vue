<script setup lang="ts">
const props = defineProps<{ total: number; limit: number; offset: number }>();
const emit = defineEmits<{ 'update:offset': [value: number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.limit)));
const page = computed(() => Math.floor(props.offset / props.limit) + 1);
const from = computed(() => (props.total ? Math.min(props.offset + 1, props.total) : 0));
const to = computed(() => Math.min(props.offset + props.limit, props.total));

const go = (next: number) => {
  const clamped = Math.min(Math.max(next, 1), pageCount.value);
  emit('update:offset', (clamped - 1) * props.limit);
};
</script>

<template>
  <footer class="adm__pager">
    <button class="adm__btn" type="button" :disabled="page <= 1" @click="go(page - 1)">← Назад</button>
    <button class="adm__btn" type="button" :disabled="page >= pageCount" @click="go(page + 1)">Далі →</button>
    <span class="adm__muted">{{ from }}–{{ to }} з {{ fmtNumber(total) }} · сторінка {{ page }} з {{ pageCount }}</span>
  </footer>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [string[]] }>();

const MAX_TAGS = 8;
const MAX_LENGTH = 32;

const draft = ref('');

/** Same normalisation the API applies, so what you type is what gets stored. */
const normalize = (raw: string) => raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase();

const commit = () => {
  const tag = normalize(draft.value);
  draft.value = '';
  if (!tag || tag.length > MAX_LENGTH) return;
  if (props.modelValue.includes(tag) || props.modelValue.length >= MAX_TAGS) return;
  emit('update:modelValue', [...props.modelValue, tag]);
};

const remove = (tag: string) => emit('update:modelValue', props.modelValue.filter((item) => item !== tag));

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
    event.preventDefault();
    commit();
  } else if (event.key === 'Backspace' && !draft.value && props.modelValue.length) {
    remove(props.modelValue[props.modelValue.length - 1]!);
  }
};
</script>

<template>
  <div>
    <div class="adm__tags" @click="($event.currentTarget as HTMLElement).querySelector('input')?.focus()">
      <span v-for="tag in modelValue" :key="tag" class="adm__tag">
        {{ tag }}
        <button type="button" :aria-label="`Прибрати ${tag}`" @click.stop="remove(tag)">×</button>
      </span>
      <input
        v-model="draft"
        type="text"
        :placeholder="modelValue.length >= MAX_TAGS ? 'Досягнуто ліміту 8' : 'додати теґ…'"
        :maxlength="MAX_LENGTH"
        :disabled="modelValue.length >= MAX_TAGS"
        @keydown="onKeydown"
        @blur="commit"
      >
    </div>
    <p class="adm__hint">До {{ MAX_TAGS }} теґів, {{ MAX_LENGTH }} символи кожен. Фасети блогу будуються саме з них.</p>
  </div>
</template>

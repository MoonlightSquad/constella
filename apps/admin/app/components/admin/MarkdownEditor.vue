<script setup lang="ts">
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const area = ref<HTMLTextAreaElement | null>(null);

const ACTIONS = [
  { label: 'H2', run: (s: string) => `## ${s}` },
  { label: 'H3', run: (s: string) => `### ${s}` },
  { label: 'Жирний', wrap: '**', tail: '**' },
  { label: 'Курсив', wrap: '*', tail: '*' },
  { label: 'Посилання', run: (s: string) => `[${s || 'текст'}](https://)` },
  { label: 'Список', run: (s: string) => `- ${s}` },
  { label: 'Цитата', run: (s: string) => `> ${s}` },
  { label: 'Код', wrap: '```\n', tail: '\n```' },
  { label: 'Image', run: (s: string) => `![${s || 'опис зображення'}](https://)` },
] as const;

const apply = (action: (typeof ACTIONS)[number]) => {
  const el = area.value;
  if (!el) return;
  const before = props.modelValue.slice(0, el.selectionStart);
  const selected = props.modelValue.slice(el.selectionStart, el.selectionEnd);
  const after = props.modelValue.slice(el.selectionEnd);
  const head = 'wrap' in action ? action.wrap : '';
  const tail = 'tail' in action && action.tail ? action.tail : '';
  const body = 'run' in action && action.run ? action.run(selected) : `${head}${selected || 'текст'}${tail}`;
  emit('update:modelValue', `${before}${body}${after}`);
  nextTick(() => {
    el.focus();
    const start = before.length + body.length;
    el.setSelectionRange(start, start);
  });
};

const words = computed(() => (props.modelValue.replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length);
// The API recomputes this on save with the same 180 words/minute; showing it here is the
// only way an editor can tell they are writing towards the number the page will print.
const minutes = computed(() => Math.min(240, Math.max(1, Math.round(words.value / 180))));
</script>

<template>
  <div>
    <div class="adm__toolbar">
      <button v-for="action in ACTIONS" :key="action.label" type="button" class="adm__tool" @click="apply(action)">
        {{ action.label }}
      </button>
    </div>
    <textarea
      ref="area"
      class="adm__area adm__area--code"
      :value="modelValue"
      spellcheck="true"
      placeholder="Текст поста markdown-ом. <script> звідси нікуди не потрапить: рендер іде з html:false."
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    >
    </textarea>
    <p class="adm__hint">{{ words }} слів · ~{{ minutes }} хв читання · {{ modelValue.length }} символів</p>
  </div>
</template>

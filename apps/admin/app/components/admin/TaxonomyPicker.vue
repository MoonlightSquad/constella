<script setup lang="ts">
import type { BlogLocale, TermRef } from '~/types/blog';
import type { TermRowWire } from '~/utils/term-draft';
import { isSlugShape, slugifyTitle } from '~/utils/slug.mjs';

const props = defineProps<{
  /** The REST segment the picker talks to, singular: 'category' | 'tag'. */
  kind: 'category' | 'tag';
  modelValue: string[];
  /** Selected terms with their display names, as attached to the post row. */
  terms: TermRef[];
  /** New terms are created in the language being edited; translations follow in the CMS. */
  locale: BlogLocale;
}>();
const emit = defineEmits<{ 'update:modelValue': [string[]] }>();

const api = useAdminApi();

const MAX = props.kind === 'category' ? 3 : 8;
const MAX_NAME = props.kind === 'category' ? 120 : 32;
const plural = `${props.kind}s`;

type Option = { id: string; name: string };

const query = ref('');
const options = ref<Option[]>([]);
const open = ref(false);
const busy = ref(false);
const error = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;

// Адмінка одномовна — українська, тож чіп показує uk-переклад, а за ним перший наявний.
const toOption = (row: TermRowWire): Option => ({
  id: row.id,
  name: row.translations.find((t) => t.locale === 'uk')?.name ?? row.translations[0]?.name ?? row.id,
});

const load = async () => {
  busy.value = true;
  error.value = '';
  try {
    const list = await api.get<{ items: TermRowWire[] }>(`/api/admin/${plural}`, {
      search: query.value.trim() || undefined,
      limit: 20,
    });
    options.value = (list?.items ?? []).map(toOption);
  } catch (cause) {
    error.value = (cause as Error).message;
    options.value = [];
  } finally {
    busy.value = false;
  }
};

watch(query, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

const labelFor = (id: string) =>
  props.terms.find((term) => term.id === id)?.name ?? options.value.find((option) => option.id === id)?.name ?? id.slice(0, 8);

const selected = computed(() => new Set(props.modelValue));
const visible = computed(() => options.value.slice(0, 12));
const exactMatch = computed(() => options.value.find((option) => option.name.toLowerCase() === query.value.trim().toLowerCase()));

const add = (id: string) => {
  if (props.modelValue.includes(id) || props.modelValue.length >= MAX) return;
  emit('update:modelValue', [...props.modelValue, id]);
};
const remove = (id: string) => emit('update:modelValue', props.modelValue.filter((item) => item !== id));
const toggle = (id: string) => (selected.value.has(id) ? remove(id) : add(id));

const full = computed(() => props.modelValue.length >= MAX);

/** Enter on a name that does not exist yet creates the term — the CMS adds translations after. */
const create = async () => {
  const name = query.value.trim();
  if (!name || full.value) return;
  const slug = slugifyTitle(name, '');
  if (!slug || !isSlugShape(slug) || slug === 'category' || slug === 'tag') {
    error.value = 'З такої назви не виходить коректний slug. Спробуй інакше або створи термін у CMS.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const created = await api.post<{ id: string }>(`/api/admin/${plural}`, {
      locale: props.locale,
      slug,
      name: name.slice(0, MAX_NAME),
      translations: [],
    });
    add(created.id);
    query.value = '';
    open.value = false;
    await load();
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    busy.value = false;
  }
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (exactMatch.value) add(exactMatch.value.id);
    else if (visible.value.length === 1) add(visible.value[0]!.id);
    else void create();
  } else if (event.key === 'Escape') {
    open.value = false;
  } else if (event.key === 'Backspace' && !query.value && props.modelValue.length) {
    remove(props.modelValue[props.modelValue.length - 1]!);
  }
};
</script>

<template>
  <div>
    <div class="adm__tags" @click="($event.currentTarget as HTMLElement).querySelector('input')?.focus()">
      <span v-for="id in modelValue" :key="id" class="adm__tag">
        {{ labelFor(id) }}
        <button type="button" :aria-label="`Прибрати ${labelFor(id)}`" @click.stop="remove(id)">×</button>
      </span>
      <input
        v-model="query"
        type="text"
        :placeholder="full ? `Досягнуто ліміту ${MAX}` : `пошук${kind === 'tag' ? ' і' : 'у'}…`"
        :maxlength="MAX_NAME"
        :disabled="full"
        autocomplete="off"
        @focus="open = true; load()"
        @blur="setTimeout(() => open = false, 150)"
        @keydown="onKeydown"
      >
    </div>

    <div v-if="open && !full" class="adm__picker">
      <p v-if="busy" class="adm__hint">Пошук…</p>
      <template v-else>
        <button
          v-for="option in visible"
          :key="option.id"
          type="button"
          class="adm__picker__row"
          :class="{ 'adm__picker__row--on': selected.has(option.id) }"
          @mousedown.prevent="toggle(option.id)"
        >
          {{ option.name }}
          <span v-if="selected.has(option.id)" class="adm__muted">✔</span>
        </button>
        <p v-if="query.trim() && !exactMatch" class="adm__hint">
          Enter — створити «{{ query.trim() }}»{{ locale === 'uk' ? '' : ` (${locale})` }} і додати. Переклади — у CMS.
        </p>
      </template>
      <p v-if="!visible.length && !busy && query.trim()" class="adm__hint">Нічого не знайдено.</p>
    </div>

    <p v-if="error" class="adm__error">{{ error }}</p>
    <p class="adm__hint">
      {{ kind === 'category' ? `До ${MAX} категорій на статтю.` : `До ${MAX} тегів.` }}
      Назви й slug перекладаються окремо — у розділі «{{ kind === 'category' ? 'Категорії' : 'Теґи' }}».
    </p>
  </div>
</template>

<style scoped>
.adm__picker {
  margin-top: 6px;
  padding: 6px;
  border: 1px solid var(--hairline);
  border-radius: var(--r-md);
  background: var(--surface-600);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.adm__picker__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 6px 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
}
.adm__picker__row:hover { background: var(--surface-500); }
.adm__picker__row--on { color: var(--gold-eyebrow); font-weight: 600; }
</style>

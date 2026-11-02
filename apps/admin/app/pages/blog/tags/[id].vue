<script setup lang="ts">
import type { AdminTagRow } from '~/types/admin';
import type { BlogLocale } from '~/types/blog';
import { emptyTermDraft, halfFilledLocales, patchFromTermDraft, termDraftFromRow } from '~/utils/term-draft';

const api = useAdminApi();
const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));

const { data: term, status: loading, refresh } = await useAsyncData(
  'admin-tag',
  () => api.get<AdminTagRow>(`/api/admin/tags/${id.value}`),
);
watch(id, () => refresh());

const draft = reactive(emptyTermDraft());
watch(term, (value) => Object.assign(draft, termDraftFromRow(value ?? null)), { immediate: true });

const locale = ref<BlogLocale>('uk');
watch(term, (value) => { if (value) locale.value = value.translations[0]?.locale ?? 'uk'; }, { immediate: true });

const saving = ref(false);
const error = ref('');
const savedAt = ref<string | null>(null);

const changes = computed(() => (term.value ? patchFromTermDraft(term.value, draft, 'tag') : {}));
const dirty = computed(() => Object.keys(changes.value).length > 0);
const { allowLeave } = useUnsavedGuard(() => dirty.value);

const existing = computed<BlogLocale[]>(() => term.value?.translations.map((row) => row.locale) ?? []);

const save = async () => {
  if (saving.value || !dirty.value) return;
  const partial = halfFilledLocales(draft).map((code) => code.toUpperCase());
  if (partial.length) {
    error.value = `Переклади ${partial.join(', ')} заповнені лише частково: назва і slug обовʼязкові.`;
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`/api/admin/tags/${id.value}`, changes.value);
    savedAt.value = new Date().toLocaleTimeString('uk-UA');
    await refresh();
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    saving.value = false;
  }
};
useSaveHotkey(save);

const removeLocale = (code: BlogLocale) => {
  if (!draft.removedLocales.includes(code)) draft.removedLocales.push(code);
  locale.value = code;
};
const restoreLocale = (code: BlogLocale) => {
  draft.removedLocales = draft.removedLocales.filter((item) => item !== code);
};

const remove = async () => {
  if (!term.value) return;
  const name = term.value.translations[0]?.name ?? '';
  if (!window.confirm(`Видалити теґ «${name}» назавжди? Статті залишаться, але без нього.`)) return;
  try {
    await api.del(`/api/admin/tags/${id.value}`);
    allowLeave();
    await navigateTo('/blog/tags');
  } catch (cause) {
    error.value = (cause as Error).message;
  }
};
</script>

<template>
  <div v-if="loading === 'pending' && !term" class="adm__muted">Завантаження…</div>

  <div v-else-if="!term" class="adm__note">
    <p>Теґ не знайдено. Можливо, його видалено в іншій вкладці.</p>
    <NuxtLink class="adm__link" to="/blog/tags">← до списку</NuxtLink>
  </div>

  <div v-else>
    <div class="adm__between">
      <h1>{{ term.translations[0]?.name ?? term.translations[0]?.slug }}</h1>
      <div class="adm__row">
        <span class="adm__chip">{{ term.postCount }} статей</span>
        <NuxtLink class="adm__link" to="/blog/tags">← список</NuxtLink>
      </div>
    </div>

    <AdminTermEditor
      v-model:locale="locale"
      kind="tag"
      :draft="draft"
      :existing="existing"
      :saving="saving"
      :error="error"
      :saved-at="savedAt"
      @save="save"
      @remove="removeLocale"
      @restore="restoreLocale"
    />

    <div class="adm__panel" style="margin-top: 22px">
      <h2>Небезпека</h2>
      <p class="adm__hint" style="margin: 10px 0">Видалення прибирає теґ з архіву й з усіх статей. Переклади статтей не чіпаються.</p>
      <button type="button" class="adm__btn" @click="remove">Видалити теґ</button>
    </div>
  </div>
</template>

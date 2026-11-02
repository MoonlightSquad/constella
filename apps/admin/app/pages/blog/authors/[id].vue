<script setup lang="ts">
import type { AdminAuthorRow } from '~/types/admin';
import type { BlogLocale } from '~/types/blog';
import { authorDraftFromRow, halfFilledAuthorLocales, patchFromAuthorDraft } from '~/utils/author-draft';

const api = useAdminApi();
const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));

const { data: author, status: loading, refresh } = await useAsyncData(
  'admin-author',
  () => api.get<AdminAuthorRow>(`/api/admin/authors/${id.value}`),
);
watch(id, () => refresh());

const draft = reactive(authorDraftFromRow(null));
watch(author, (value) => Object.assign(draft, authorDraftFromRow(value ?? null)), { immediate: true });

const locale = ref<BlogLocale>('uk');
watch(author, (value) => { if (value) locale.value = value.translations[0]?.locale ?? 'uk'; }, { immediate: true });

const saving = ref(false);
const error = ref('');
const savedAt = ref<string | null>(null);

const changes = computed(() => (author.value ? patchFromAuthorDraft(author.value, draft) : {}));
const dirty = computed(() => Object.keys(changes.value).length > 0);
const { allowLeave } = useUnsavedGuard(() => dirty.value);

const existing = computed<BlogLocale[]>(() => author.value?.translations.map((row) => row.locale) ?? []);

const save = async () => {
  if (saving.value || !dirty.value) return;
  const partial = halfFilledAuthorLocales(draft).map((code) => code.toUpperCase());
  if (partial.length) {
    error.value = `Переклади ${partial.join(', ')} заповнені лише частково: імʼя і slug обовʼязкові.`;
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`/api/admin/authors/${id.value}`, changes.value);
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
  if (!author.value) return;
  const name = author.value.translations[0]?.name ?? '';
  if (!window.confirm(`Видалити профіль «${name}» назавжди? Статті залишаться, але їхнім підписом стане вільний текст authorName.`)) return;
  try {
    await api.del(`/api/admin/authors/${id.value}`);
    allowLeave();
    await navigateTo('/blog/authors');
  } catch (cause) {
    error.value = (cause as Error).message;
  }
};
</script>

<template>
  <div v-if="loading === 'pending' && !author" class="adm__muted">Завантаження…</div>

  <div v-else-if="!author" class="adm__note">
    <p>Профіль не знайдено. Можливо, його видалено в іншій вкладці.</p>
    <NuxtLink class="adm__link" to="/blog/authors">← до списку</NuxtLink>
  </div>

  <div v-else>
    <div class="adm__between">
      <h1>{{ author.translations[0]?.name ?? author.translations[0]?.slug }}</h1>
      <div class="adm__row">
        <span class="adm__chip">{{ author.postCount }} статей</span>
        <NuxtLink class="adm__link" to="/blog/authors">← список</NuxtLink>
      </div>
    </div>

    <AdminAuthorEditor
      v-model:locale="locale"
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
      <p class="adm__hint" style="margin: 10px 0">
        Видалення прибирає профіль і його URL. Статті лишаються, але підписом стає вільний текст —
        тому спершу перепідпиши їх іншим автором.
      </p>
      <button type="button" class="adm__btn" @click="remove">Видалити автора</button>
    </div>
  </div>
</template>

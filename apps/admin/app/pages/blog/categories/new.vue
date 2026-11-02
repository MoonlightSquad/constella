<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';
import { createTermBody, emptyTermDraft, halfFilledLocales } from '~/utils/term-draft';

const api = useAdminApi();
const draft = reactive(emptyTermDraft());
const locale = ref<BlogLocale>('uk');
const saving = ref(false);
const error = ref('');

const dirty = () => draft.translations.some((item) => item.name.trim() || item.slug.trim());
const { allowLeave } = useUnsavedGuard(dirty);

const save = async () => {
  if (saving.value) return;
  const partial = halfFilledLocales(draft).map((code) => code.toUpperCase());
  if (partial.length) {
    error.value = `Переклади ${partial.join(', ')} заповнені лише частково: назва і slug обовʼязкові.`;
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const created = await api.post<{ id: string }>('/api/admin/categories', createTermBody(locale.value, draft, 'category'));
    allowLeave();
    await navigateTo(`/blog/categories/${created.id}`);
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    saving.value = false;
  }
};

useSaveHotkey(save);
</script>

<template>
  <div>
    <div class="adm__between">
      <h1>Нова категорія</h1>
      <NuxtLink class="adm__link" to="/blog/categories">← до списку</NuxtLink>
    </div>
    <p class="adm__hint" style="margin-bottom: 16px">
      Оберіть основну мову — нею категорія живе в архіві. Решту вкладок можна заповнити одразу або додати пізніше.
    </p>

    <AdminTermEditor v-model:locale="locale" kind="category" :draft="draft" :existing="[]" :saving="saving" :error="error" @save="save" />
  </div>
</template>

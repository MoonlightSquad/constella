<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';
import { createAuthorBody, emptyAuthorDraft, halfFilledAuthorLocales } from '~/utils/author-draft';

const api = useAdminApi();
const draft = reactive(emptyAuthorDraft());
const locale = ref<BlogLocale>('uk');
const saving = ref(false);
const error = ref('');

const dirty = () => draft.translations.some((item) => item.name.trim() || item.slug.trim()) || Boolean(draft.avatarUrl || draft.sameAs.trim());
const { allowLeave } = useUnsavedGuard(dirty);

const save = async () => {
  if (saving.value) return;
  const partial = halfFilledAuthorLocales(draft).map((code) => code.toUpperCase());
  if (partial.length) {
    error.value = `Переклади ${partial.join(', ')} заповнені лише частково: імʼя і slug обовʼязкові.`;
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const created = await api.post<{ id: string }>('/api/admin/authors', createAuthorBody(locale.value, draft));
    allowLeave();
    await navigateTo(`/blog/authors/${created.id}`);
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
      <h1>Новий автор</h1>
      <NuxtLink class="adm__link" to="/blog/authors">← до списку</NuxtLink>
    </div>
    <p class="adm__hint" style="margin-bottom: 16px">
      Оберіть основну мову — нею профіль живе в архіві. Решту вкладок можна заповнити одразу або додати пізніше.
      Підписуй лише реальною людиною: роль і біо мають бути правдою, інакше це саме те, за що знімають індексацію.
    </p>

    <AdminAuthorEditor v-model:locale="locale" :draft="draft" :existing="[]" :saving="saving" :error="error" @save="save" />
  </div>
</template>

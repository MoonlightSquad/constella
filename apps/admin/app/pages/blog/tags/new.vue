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
    const created = await api.post<{ id: string }>('/api/admin/tags', createTermBody(locale.value, draft, 'tag'));
    allowLeave();
    await navigateTo(`/blog/tags/${created.id}`);
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
      <h1>Новий теґ</h1>
      <NuxtLink class="adm__link" to="/blog/tags">← до списку</NuxtLink>
    </div>
    <p class="adm__hint" style="margin-bottom: 16px">
      Теґ — коротка назва без опису й SEO-полів: архів тегу живе лише назвою.
    </p>

    <AdminTermEditor v-model:locale="locale" kind="tag" :draft="draft" :existing="[]" :saving="saving" :error="error" @save="save" />
  </div>
</template>

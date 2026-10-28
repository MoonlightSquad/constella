<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';
import type { AdminPostRow } from '~/types/admin';
import { createFromDraft, emptyDraft } from '~/utils/post-draft';

const api = useAdminApi();
const draft = reactive(emptyDraft());
const locale = ref<BlogLocale>('uk');
const saving = ref(false);
const error = ref('');
const savedAt = ref<string | null>(null);

const dirty = () => Boolean(draft.title.trim() || draft.bodyMarkdown.trim() || draft.excerpt.trim());
const { allowLeave } = useUnsavedGuard(dirty);

const save = async () => {
  if (saving.value) return;
  if (!draft.title.trim() || !draft.excerpt.trim() || !draft.bodyMarkdown.trim()) {
    error.value = 'Заголовок, анонс і тіло обовʼязкові — без них пост не публікується коректно.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const post = await api.post<AdminPostRow>('/api/admin/posts', createFromDraft(locale.value, draft));
    savedAt.value = new Date().toLocaleTimeString('uk-UA');
    // A new row is a draft; the editor continues on its page, where publishing lives.
    allowLeave();
    await navigateTo(`/blog/${post.id}`);
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
      <h1>Новий пост</h1>
      <NuxtLink class="adm__link" to="/blog">← до списку</NuxtLink>
    </div>
    <p class="adm__hint" style="margin-bottom: 16px">
      Збережений пост завжди чернетка: опубликувати — окремий крок із причиною в журналі.
    </p>

    <AdminPostEditor v-model:locale="locale" :draft="draft" :saving="saving" :error="error" :saved-at="savedAt" @save="save" />
  </div>
</template>

<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';
import type { PostDraft } from '~/types/admin';
import { isSlugShape, slugifyTitle } from '~/utils/slug.mjs';

const props = defineProps<{
  draft: PostDraft;
  locale: BlogLocale;
  /** Changing the language of an existing row would break its hreflang cluster. */
  lockedLocale?: boolean;
  saving?: boolean;
  error?: string;
  savedAt?: string | null;
}>();

const emit = defineEmits<{ save: []; 'update:locale': [BlogLocale] }>();

const slugTouched = ref(Boolean(props.draft.slug));
const slugWarning = computed(() => {
  if (!props.draft.slug) return 'Slug потрібен.';
  return isSlugShape(props.draft.slug) ? '' : 'Тільки a–z, 0–9 і дефіси. Кирилиця транслітерується кнопкою нижче.';
});

const syncSlugFromTitle = () => {
  props.draft.slug = slugifyTitle(props.draft.title);
  slugTouched.value = true;
};

watch(
  () => props.draft.title,
  (title) => {
    if (slugTouched.value) return;
    props.draft.slug = slugifyTitle(title);
  },
);

const preview = ref(false);
const { siteUrl } = useRuntimeConfig().public;
</script>

<template>
  <div class="adm__editor">
    <div>
      <div class="adm__panel">
        <h2>Зміст</h2>

        <div class="adm__field" style="margin-top: 12px">
          <span class="adm__label">Мова</span>
          <AdminLocalePicker :model-value="locale" :locked="lockedLocale" @update:model-value="emit('update:locale', $event)" />
        </div>

        <div class="adm__field">
          <label class="adm__label" for="post-title">Заголовок (H1 на сторінці)</label>
          <input id="post-title" v-model="draft.title" class="adm__input" type="text" maxlength="200" required>
        </div>

        <div class="adm__field">
          <label class="adm__label" for="post-slug">
            Slug
            <span class="adm__count">{{ draft.slug.length }}/200</span>
          </label>
          <input id="post-slug" v-model="draft.slug" class="adm__input" type="text" maxlength="200" @input="slugTouched = true">
          <div class="adm__row" style="margin-top: 6px">
            <button type="button" class="adm__tool" @click="syncSlugFromTitle">Зробити з заголовка</button>
            <span v-if="slugWarning" class="adm__error">{{ slugWarning }}</span>
          </div>
        </div>

        <div class="adm__field">
          <label class="adm__label" for="post-excerpt">
            Анонс
            <span class="adm__count" :class="{ 'adm__count--over': draft.excerpt.length > 500 }">{{ draft.excerpt.length }}/500</span>
          </label>
          <textarea id="post-excerpt" v-model="draft.excerpt" class="adm__area" maxlength="500" placeholder="Один-два абзаци для списку, RSS і meta description"></textarea>
        </div>

        <div class="adm__field">
          <span class="adm__label">Теґи</span>
          <AdminTagInput v-model="draft.tags" />
        </div>

        <div class="adm__field">
          <label class="adm__label" for="post-author">Автор</label>
          <input id="post-author" v-model="draft.authorName" class="adm__input" type="text" maxlength="80" placeholder="Як підписати в статті й у JSON-LD">
        </div>

        <div class="adm__field">
          <span class="adm__label">Тіло (markdown)</span>
          <AdminMarkdownEditor v-model="draft.bodyMarkdown" />
        </div>
      </div>

      <div class="adm__panel">
        <div class="adm__between">
          <h2>Попередній перегляд</h2>
          <button type="button" class="adm__btn" @click="preview = !preview">{{ preview ? 'Сховати' : 'Показати' }}</button>
        </div>
        <AdminPostPreview v-if="preview" :markdown="draft.bodyMarkdown" :active="preview" />
      </div>
    </div>

    <aside>
      <div class="adm__panel">
        <h2>Публікація</h2>
        <div style="margin-top: 12px">
          <AdminCoverUploadField :draft="draft" />
        </div>
      </div>

      <div class="adm__panel">
        <h2>СЕО</h2>
        <div style="margin-top: 12px">
          <AdminSeoFields :draft="draft" :slug="draft.slug" :locale="locale" :site-url="siteUrl" />
        </div>
      </div>

      <div class="adm__panel">
        <button type="button" class="adm__btn adm__btn--gold adm__btn-block" :disabled="saving || !draft.title || !draft.slug || !!slugWarning" @click="emit('save')">
          {{ saving ? 'Збереження…' : 'Зберегти (⌘S)' }}
        </button>
        <p v-if="savedAt" class="adm__hint">Останнє збереження {{ savedAt }}</p>
        <p v-if="error" class="adm__error" role="alert">{{ error }}</p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.adm__btn-block { width: 100%; }
</style>

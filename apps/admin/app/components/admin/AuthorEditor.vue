<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';
import type { AuthorDraft } from '~/utils/author-draft';
import { AUTHOR_MAX } from '~/utils/author-draft';
import { isSlugShape, slugifyTitle } from '~/utils/slug.mjs';

// Копія TermEditor з тією самою формою вкладок: переклад у автора влаштований як у категорії,
// тільки поля інші (роль і біо замість опису архіву) плюс аватар і профілі на всю людину.
const props = defineProps<{
  draft: AuthorDraft;
  locale: BlogLocale;
  /** Локалі, що вже є в базі; решта вкладок — «додати переклад». */
  existing: BlogLocale[];
  saving?: boolean;
  error?: string;
  savedAt?: string | null;
}>();

const emit = defineEmits<{
  save: [];
  'update:locale': [BlogLocale];
  remove: [BlogLocale];
  restore: [BlogLocale];
}>();

const NAMES: Record<BlogLocale, string> = { uk: 'Українська', en: 'English', de: 'Deutsch', fr: 'Français' };
const LOCALES = Object.keys(NAMES) as BlogLocale[];

const slot = computed(() => props.draft.translations.find((item) => item.locale === props.locale)!);
const isExisting = computed(() => props.existing.includes(props.locale));
const isRemoved = computed(() => props.draft.removedLocales.includes(props.locale));
/** Останній переклад видалити не можна: без нього профіль зникає з усіх архівних URL. */
const keepable = computed(() => props.existing.length - props.draft.removedLocales.length > 1);

const slugTouched = ref(Boolean(slot.value.slug));
watch(() => props.locale, () => { slugTouched.value = Boolean(slot.value.slug); });
watch(() => slot.value.name, (name) => {
  if (slugTouched.value) return;
  slot.value.slug = slugifyTitle(name, '');
});

const slugWarning = computed(() => {
  const value = slot.value.slug;
  if (!value) return 'Slug потрібен.';
  return isSlugShape(value) ? '' : 'Тільки a–z, 0–9 і дефіси. Кирилиця транслітерується кнопкою нижче.';
});

const syncSlug = () => {
  slot.value.slug = slugifyTitle(slot.value.name, '');
  slugTouched.value = true;
};

const archiveUrl = computed(() => publicArchiveUrl('author', props.locale, slot.value.slug));

const sameAsLines = computed(() => props.draft.sameAs.split('\n').map((line) => line.trim()).filter(Boolean));
const sameAsOver = computed(() => sameAsLines.value.length > AUTHOR_MAX.sameAs);

const canSave = computed(
  () =>
    !props.saving &&
    Boolean(slot.value.name.trim()) &&
    Boolean(slot.value.slug) &&
    !slugWarning.value &&
    !isRemoved.value &&
    // Те саме правило, що в schema: фото без опису не зберігається.
    !(props.draft.avatarUrl && !props.draft.avatarAlt.trim()) &&
    !sameAsOver.value,
);
</script>

<template>
  <div class="adm__editor">
    <div>
      <div class="adm__panel">
        <h2>Переклади</h2>

        <div class="adm__row" role="group" aria-label="Мова перекладу" style="margin-top: 12px">
          <button
            v-for="code in LOCALES"
            :key="code"
            type="button"
            class="adm__chip"
            :class="{ 'adm__tab--on': locale === code }"
            :aria-pressed="locale === code"
            :style="draft.removedLocales.includes(code) ? 'text-decoration: line-through; opacity: .55' : ''"
            @click="emit('update:locale', code)"
          >
            {{ NAMES[code] }}
          </button>
        </div>

        <p v-if="isRemoved" class="adm__note" style="margin-top: 14px">
          Переклад «{{ NAMES[locale] }}» буде видалено при збереженні.
          <button type="button" class="adm__tool" style="margin-left: 8px" @click="emit('restore', locale)">Повернути</button>
        </p>

        <template v-if="!isRemoved">
          <div class="adm__field" style="margin-top: 16px">
            <label class="adm__label" :for="`author-name-${locale}`">
              Імʼя ({{ NAMES[locale] }})
              <span class="adm__count" :class="{ 'adm__count--over': slot.name.length > AUTHOR_MAX.name }">{{ slot.name.length }}/{{ AUTHOR_MAX.name }}</span>
            </label>
            <input :id="`author-name-${locale}`" v-model="slot.name" class="adm__input" type="text" :maxlength="AUTHOR_MAX.name" required>
          </div>

          <div class="adm__field">
            <label class="adm__label" :for="`author-slug-${locale}`">Slug профілю</label>
            <input :id="`author-slug-${locale}`" v-model="slot.slug" class="adm__input" type="text" maxlength="200" @input="slugTouched = true">
            <div class="adm__row" style="margin-top: 6px">
              <button type="button" class="adm__tool" @click="syncSlug">Зробити з імені</button>
              <span v-if="slugWarning" class="adm__error">{{ slugWarning }}</span>
            </div>
            <p v-if="archiveUrl" class="adm__hint">
              Профіль: <code>/blog/author/{{ slot.slug || '…' }}</code>
              <a class="adm__link" :href="archiveUrl" target="_blank" rel="noopener">відкрити ↗</a>
            </p>
          </div>

          <div class="adm__field">
            <label class="adm__label" :for="`author-role-${locale}`">
              Роль
              <span class="adm__count" :class="{ 'adm__count--over': slot.role.length > AUTHOR_MAX.role }">{{ slot.role.length }}/{{ AUTHOR_MAX.role }}</span>
            </label>
            <input
              :id="`author-role-${locale}`"
              v-model="slot.role"
              class="adm__input"
              type="text"
              :maxlength="AUTHOR_MAX.role"
              placeholder="Наприклад: «редакторка блогу», «спеціалістка з модерації»"
            >
          </div>

          <div class="adm__field">
            <label class="adm__label" :for="`author-bio-${locale}`">
              Біо
              <span class="adm__count" :class="{ 'adm__count--over': slot.bio.length > AUTHOR_MAX.bio }">{{ slot.bio.length }}/{{ AUTHOR_MAX.bio }}</span>
            </label>
            <textarea
              :id="`author-bio-${locale}`"
              v-model="slot.bio"
              class="adm__area"
              :maxlength="AUTHOR_MAX.bio"
              placeholder="2–4 речення: чим людина займається і чому їй можна вірити в цій темі. Без вигаданих регалій."
            ></textarea>
          </div>

          <div class="adm__field">
            <label class="adm__label" :for="`author-seo-title-${locale}`">
              SEO title
              <span class="adm__count" :class="{ 'adm__count--over': slot.seoTitle.length > 60 }">{{ slot.seoTitle.length }}/60</span>
            </label>
            <input :id="`author-seo-title-${locale}`" v-model="slot.seoTitle" class="adm__input" type="text" maxlength="200" placeholder="Порожньо — візьметься імʼя">
          </div>

          <div class="adm__field">
            <label class="adm__label" :for="`author-seo-desc-${locale}`">
              Meta description
              <span class="adm__count" :class="{ 'adm__count--over': slot.seoDescription.length > 160 }">{{ slot.seoDescription.length }}/160</span>
            </label>
            <textarea :id="`author-seo-desc-${locale}`" v-model="slot.seoDescription" class="adm__area" maxlength="500" placeholder="Порожньо — візьметься біо"></textarea>
          </div>

          <div v-if="isExisting" class="adm__row" style="margin-top: 14px">
            <button type="button" class="adm__btn" :disabled="!keepable" @click="emit('remove', locale)">Видалити цей переклад</button>
            <span v-if="!keepable" class="adm__hint">Останній переклад не можна видалити.</span>
          </div>
          <p v-else class="adm__hint">Новий переклад — додай імʼя й slug, потім збережи.</p>
        </template>
      </div>

      <div class="adm__panel" style="margin-top: 18px">
        <h2>Фото та профілі</h2>
        <p class="adm__hint" style="margin: 8px 0 12px">
          Аватар і посилання — на всю людину, а не на мову: це одне фото й той самий набір
          профілів в усіх чотирьох архівах.
        </p>
        <div style="margin-bottom: 16px">
          <AdminCoverUploadField
            v-model:url="draft.avatarUrl"
            v-model:alt="draft.avatarAlt"
            endpoint="/api/admin/avatars"
            title="Фото автора"
            note="перетягни файл сюди або клікни · JPEG/PNG/WebP · 512×512 після нормалізації"
          />
        </div>

        <div class="adm__field">
          <label class="adm__label" for="author-same-as">
            Профілі — по одному на рядок
            <span class="adm__count" :class="{ 'adm__count--over': sameAsOver }">{{ sameAsLines.length }}/{{ AUTHOR_MAX.sameAs }}</span>
          </label>
          <textarea
            id="author-same-as"
            v-model="draft.sameAs"
            class="adm__area"
            placeholder="https://t.me/…&#10;https://www.linkedin.com/in/…"
          ></textarea>
          <p v-if="sameAsOver" class="adm__error">До {{ AUTHOR_MAX.sameAs }} профілів.</p>
          <p v-else class="adm__hint">
            Google читає це як підтвердження, що людина справді існує: беріть адреси з реальних
            сторінок, а не назви акаунтів.
          </p>
        </div>
      </div>
    </div>

    <aside>
      <div class="adm__panel">
        <button type="button" class="adm__btn adm__btn--gold adm__btn-block" :disabled="!canSave" @click="emit('save')">
          {{ saving ? 'Збереження…' : 'Зберегти (⌘S)' }}
        </button>
        <p v-if="savedAt" class="adm__hint">Останнє збереження {{ savedAt }}</p>
        <p v-if="error" class="adm__error" role="alert">{{ error }}</p>
        <p v-if="!isExisting" class="adm__hint">
          Усі заповнені вкладки збережуться одним запитом — переклади не треба робити по одному.
        </p>
      </div>
    </aside>
  </div>
</template>

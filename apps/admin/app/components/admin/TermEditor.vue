<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';
import type { PillarOption, TermDraft, TermKind } from '~/utils/term-draft';
import { TERM_LOCALES } from '~/utils/term-draft';
import { isSlugShape, slugifyTitle } from '~/utils/slug.mjs';

const props = defineProps<{
  kind: TermKind;
  draft: TermDraft;
  locale: BlogLocale;
  /** Локалі, що вже є в базі; решта вкладок — «додати переклад». */
  existing: BlogLocale[];
  /** Статті категорії для pillar-вибору; для тегів не передається. */
  pillarOptions?: PillarOption[];
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

const slot = computed(() => props.draft.translations.find((item) => item.locale === props.locale)!);
const isExisting = computed(() => props.existing.includes(props.locale));
const isRemoved = computed(() => props.draft.removedLocales.includes(props.locale));
/** Останній переклад видалити не можна: без нього сутність зникає з усіх архівних URL. */
const keepable = computed(() => props.existing.length - props.draft.removedLocales.length > 1);

const MAX_NAME = computed(() => (props.kind === 'category' ? 120 : 32));

const slugTouched = ref(Boolean(slot.value.slug));
watch(() => props.locale, () => { slugTouched.value = Boolean(slot.value.slug); });
watch(() => slot.value.name, (name) => {
  if (slugTouched.value) return;
  slot.value.slug = slugifyTitle(name, '');
});

const slugWarning = computed(() => {
  const value = slot.value.slug;
  if (!value) return 'Slug потрібен.';
  if (value === 'category' || value === 'tag') return 'Зарезервовано для архівів — обери інший.';
  return isSlugShape(value) ? '' : 'Тільки a–z, 0–9 і дефіси. Кирилиця транслітерується кнопкою нижче.';
});

const syncSlug = () => {
  slot.value.slug = slugifyTitle(slot.value.name, '');
  slugTouched.value = true;
};

const archiveUrl = computed(() => publicArchiveUrl(props.kind, props.locale, slot.value.slug));

/**
 * Pin може посилатися на статтю поза цим списком (категорію щойно переповнили, або ліміт
 * вибірки), тому select показує окремий варіант замість того, щоб мовчки малювати
 * «без pillar» і зберегти очищення випадково.
 */
const pinnedOutside = computed(() => {
  const id = props.draft.pinnedPostGroupId;
  return id && !(props.pillarOptions ?? []).some((option) => option.groupId === id) ? id : '';
});
</script>

<template>
  <div class="adm__editor">
    <div>
      <div class="adm__panel">
        <h2>Переклади</h2>

        <div class="adm__row" role="group" aria-label="Мова перекладу" style="margin-top: 12px">
          <button
            v-for="code in TERM_LOCALES"
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
            <label class="adm__label" :for="`term-name-${locale}`">
              Назва ({{ NAMES[locale] }})
              <span class="adm__count" :class="{ 'adm__count--over': slot.name.length > MAX_NAME }">{{ slot.name.length }}/{{ MAX_NAME }}</span>
            </label>
            <input :id="`term-name-${locale}`" v-model="slot.name" class="adm__input" type="text" :maxlength="MAX_NAME" required>
          </div>

          <div class="adm__field">
            <label class="adm__label" :for="`term-slug-${locale}`">Slug архіву</label>
            <input :id="`term-slug-${locale}`" v-model="slot.slug" class="adm__input" type="text" maxlength="200" @input="slugTouched = true">
            <div class="adm__row" style="margin-top: 6px">
              <button type="button" class="adm__tool" @click="syncSlug">Зробити з назви</button>
              <span v-if="slugWarning" class="adm__error">{{ slugWarning }}</span>
            </div>
            <p v-if="archiveUrl" class="adm__hint">
              Архів: <code>/blog/{{ kind }}/{{ slot.slug || '…' }}</code>
              <a class="adm__link" :href="archiveUrl" target="_blank" rel="noopener">відкрити ↗</a>
            </p>
          </div>

          <template v-if="kind === 'category'">
            <div class="adm__field">
              <label class="adm__label" :for="`term-desc-${locale}`">
                Опис архіву
                <span class="adm__count" :class="{ 'adm__count--over': slot.description.length > 500 }">{{ slot.description.length }}/500</span>
              </label>
              <textarea :id="`term-desc-${locale}`" v-model="slot.description" class="adm__area" maxlength="500" placeholder="1–2 речення для сторінки категорії (теґи опису не мають)"></textarea>
            </div>

            <div class="adm__field">
              <label class="adm__label" :for="`term-seo-title-${locale}`">
                SEO title
                <span class="adm__count" :class="{ 'adm__count--over': slot.seoTitle.length > 60 }">{{ slot.seoTitle.length }}/60</span>
              </label>
              <input :id="`term-seo-title-${locale}`" v-model="slot.seoTitle" class="adm__input" type="text" maxlength="200" placeholder="Порожньо — візьметься назва">
            </div>

            <div class="adm__field">
              <label class="adm__label" :for="`term-seo-desc-${locale}`">
                Meta description
                <span class="adm__count" :class="{ 'adm__count--over': slot.seoDescription.length > 160 }">{{ slot.seoDescription.length }}/160</span>
              </label>
              <textarea :id="`term-seo-desc-${locale}`" v-model="slot.seoDescription" class="adm__area" maxlength="500" placeholder="Порожньо — візьметься опис"></textarea>
            </div>
          </template>

          <div v-if="isExisting" class="adm__row" style="margin-top: 14px">
            <button type="button" class="adm__btn" :disabled="!keepable" @click="emit('remove', locale)">Видалити цей переклад</button>
            <span v-if="!keepable" class="adm__hint">Останній переклад не можна видалити.</span>
          </div>
          <p v-else class="adm__hint">Новий переклад — додай назву й slug, потім збережи.</p>
        </template>
      </div>

      <div v-if="kind === 'category' && (pillarOptions?.length || pinnedOutside)" class="adm__panel" style="margin-top: 18px">
        <h2>Почати тут (pillar)</h2>
        <p class="adm__hint" style="margin: 8px 0 12px">
          Одна стаття, з якої радимо почати читати категорію. Архів показує її лише в тих мовах,
          де стаття опублікована, — решта мов побачять звичайну сітку.
        </p>
        <label class="adm__label" for="term-pillar">Стаття категорії</label>
        <select id="term-pillar" v-model="draft.pinnedPostGroupId" class="adm__input">
          <option value="">— без pillar —</option>
          <option v-if="pinnedOutside" :value="pinnedOutside">Поточна pillar — поза цим списком</option>
          <option v-for="option in pillarOptions" :key="option.groupId" :value="option.groupId">
            {{ option.label }}{{ option.publishedLocales.length ? ` · ${option.publishedLocales.join(', ')}` : ' · чернетка' }}
          </option>
        </select>
      </div>
    </div>

    <aside>
      <div class="adm__panel">
        <button
          type="button"
          class="adm__btn adm__btn--gold adm__btn-block"
          :disabled="saving || !slot.name.trim() || !slot.slug || !!slugWarning || isRemoved"
          @click="emit('save')"
        >
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

<style scoped>
.adm__btn-block { width: 100%; }
</style>

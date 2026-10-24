<script setup lang="ts">
import type { PostDraft } from '~/types/admin';

const props = defineProps<{ draft: PostDraft; slug: string; locale: string; siteUrl: string }>();

const TITLE_LIMIT = 60;
const DESC_LIMIT = 160;

const previewUrl = computed(() => {
  const path = props.locale === 'uk' ? '/blog' : `/${props.locale}/blog`;
  return `${new URL(props.siteUrl).host}${path}/${props.slug || '—'}`;
});
const previewTitle = computed(() => props.draft.seoTitle || props.draft.title || 'Заголовок поста');
const previewDescription = computed(() => props.draft.seoDescription || props.draft.excerpt || 'Опис, який побачить людина в пошуку.');
</script>

<template>
  <div>
    <div class="adm__field">
      <label class="adm__label" for="seo-title">
        SEO title
        <span class="adm__count" :class="{ 'adm__count--over': (draft.seoTitle || '').length > TITLE_LIMIT }">
          {{ (draft.seoTitle || '').length }}/{{ TITLE_LIMIT }}
        </span>
      </label>
      <input id="seo-title" v-model="draft.seoTitle" class="adm__input" type="text" maxlength="200" placeholder="Порожньо — візьметься заголовок">
    </div>

    <div class="adm__field">
      <label class="adm__label" for="seo-desc">
        Meta description
        <span class="adm__count" :class="{ 'adm__count--over': (draft.seoDescription || '').length > DESC_LIMIT }">
          {{ (draft.seoDescription || '').length }}/{{ DESC_LIMIT }}
        </span>
      </label>
      <textarea id="seo-desc" v-model="draft.seoDescription" class="adm__area adm__area--tall" maxlength="500" placeholder="Порожньо — візьметься анонс"></textarea>
    </div>

    <div class="adm__serp" aria-hidden="true">
      <p class="adm__serp__url">{{ previewUrl }}</p>
      <p class="adm__serp__title">{{ previewTitle.slice(0, 60) }}</p>
      <p class="adm__serp__desc">{{ previewDescription.slice(0, 160) }}</p>
    </div>
    <p class="adm__hint">Так це виглядатиме в Google. Довше за ліміт обрізається без твого відома.</p>

    <div class="adm__field" style="margin-top: 14px">
      <label class="adm__label" for="seo-og">OG image URL</label>
      <input id="seo-og" v-model="draft.ogImageUrl" class="adm__input" type="url" placeholder="https://…  (без обкладинки візьметься coverUrl)">
    </div>

    <div class="adm__field">
      <label class="adm__label" for="seo-canonical">Canonical URL</label>
      <input id="seo-canonical" v-model="draft.canonicalUrl" class="adm__input" type="url" placeholder="Лиш порожнім, крім синдикації">
    </div>

    <label class="adm__row" style="gap: 8px">
      <input id="seo-noindex" v-model="draft.noindex" type="checkbox">
      <span class="adm__muted">Noindex — пост живe, але не росте в індексі (сезонний, синдикований)</span>
    </label>
  </div>
</template>

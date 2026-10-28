<script setup lang="ts">
import type { AdminPostRow } from '~/types/admin';

defineProps<{ rows: AdminPostRow[] }>();

const STATUS_LABEL: Record<string, string> = { draft: 'чернетка', published: 'опубліковано', archived: 'архів' };

/** Mirrors the public route: /blog/<slug> is Ukrainian, the rest carry the prefix. */
const publicPath = (row: AdminPostRow) => publicPostUrl(row.locale, row.slug);
const date = (value: string) => new Date(value).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <table class="adm__table">
    <thead>
      <tr>
        <th>Пост</th>
        <th class="adm__nowrap">Статус</th>
        <th class="adm__nowrap">Мова</th>
        <th class="adm__nowrap">Змінено</th>
        <th><span class="adm__muted">Посилання</span></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.id">
        <td>
          <NuxtLink class="adm__title" :to="`/blog/${row.id}`">{{ row.title }}</NuxtLink>
          <span class="adm__slug">/blog/{{ row.slug }}</span>
          <p v-if="row.noindex" class="adm__hint">noindex</p>
        </td>
        <td class="adm__nowrap">
          <span class="adm__chip" :class="`adm__chip--${row.status}`">{{ STATUS_LABEL[row.status] }}</span>
          <p v-if="row.publishedAt" class="adm__hint">опубліковано {{ new Date(row.publishedAt).toLocaleDateString('uk-UA') }}</p>
        </td>
        <td class="adm__nowrap">{{ row.locale }}</td>
        <td class="adm__nowrap">{{ date(row.updatedAt) }}</td>
        <td class="adm__nowrap">
          <a v-if="row.status === 'published' && publicPath(row)" class="adm__link" :href="publicPath(row)" target="_blank" rel="noopener">Сайт ↗</a>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import type { BlogLocale } from '~/types/blog';

type ListKind = 'category' | 'tag' | 'author';

/**
 * Мінімальна форма рядка: в автора переклад несе роль і біо, яких у термінів немає, тому
 * таблиця читає лише спільні поля й не розрізняє три сутності типами.
 */
type ListRow = {
  id: string;
  createdAt?: string;
  postCount: number;
  translations: { locale: BlogLocale; slug: string; name: string }[];
};

defineProps<{ kind: ListKind; rows: ListRow[] }>();

const LABEL: Record<ListKind, string> = { category: 'Категорія', tag: 'Теґ', author: 'Автор' };

// Адмінка одномовна: показуємо uk-переклад, а за нього — будь-який наявний.
const nameOf = (row: ListRow) => row.translations.find((t) => t.locale === 'uk')?.name ?? row.translations[0]?.name ?? '—';
const ukSlugOf = (row: ListRow) => row.translations.find((t) => t.locale === 'uk')?.slug ?? '';
const path = (kind: ListKind) => `/blog/${kind}s`;
</script>

<template>
  <table class="adm__table">
    <thead>
      <tr>
        <th>{{ LABEL[kind] }}</th>
        <th class="adm__nowrap">Мови</th>
        <th class="adm__nowrap">Статей</th>
        <th class="adm__nowrap">Створено</th>
        <th><span class="adm__muted">Архів</span></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.id">
        <td>
          <NuxtLink class="adm__title" :to="`${path(kind)}/${row.id}`">{{ nameOf(row) }}</NuxtLink>
          <span v-if="ukSlugOf(row)" class="adm__slug">/blog/{{ kind }}/{{ ukSlugOf(row) }}</span>
        </td>
        <td class="adm__nowrap">
          <span v-for="t in row.translations" :key="t.locale" class="adm__chip" style="margin-right: 4px">{{ t.locale }}</span>
        </td>
        <td class="adm__nowrap">{{ row.postCount }}</td>
        <td class="adm__nowrap">{{ row.createdAt ? new Date(row.createdAt).toLocaleDateString('uk-UA') : '—' }}</td>
        <td class="adm__nowrap">
          <a
            v-if="ukSlugOf(row) && publicArchiveUrl(kind, 'uk', ukSlugOf(row))"
            class="adm__link"
            :href="publicArchiveUrl(kind, 'uk', ukSlugOf(row))"
            target="_blank"
            rel="noopener"
          >Сайт ↗</a>
        </td>
      </tr>
    </tbody>
  </table>
</template>

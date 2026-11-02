<script setup lang="ts">
import type { TermKind, TermRowWire } from '~/utils/term-draft';

defineProps<{ kind: TermKind; rows: TermRowWire[] }>();

// Адмінка одномовна: показуємо uk-переклад, а за нього — будь-який наявний.
const nameOf = (row: TermRowWire) => row.translations.find((t) => t.locale === 'uk')?.name ?? row.translations[0]?.name ?? '—';
const ukSlugOf = (row: TermRowWire) => row.translations.find((t) => t.locale === 'uk')?.slug ?? '';
const path = (kind: TermKind) => `/blog/${kind}s`;
</script>

<template>
  <table class="adm__table">
    <thead>
      <tr>
        <th>{{ kind === 'category' ? 'Категорія' : 'Теґ' }}</th>
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

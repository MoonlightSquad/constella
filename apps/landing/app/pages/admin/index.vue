<script setup lang="ts">
import type { AdminList, AdminPostRow } from '~/types/admin';

definePageMeta({ layout: 'admin', i18n: false, middleware: 'admin-auth' });

const api = useAdminApi();
const filters = reactive({ locale: '', status: '', search: '', offset: 0 });
const limit = 25;

const { data, status, error, refresh } = await useAsyncData('admin-posts', () =>
  api.get<AdminList>('/api/admin/posts', { ...filters, limit }).then((list) => ({ list: list ?? { total: 0, items: [] as AdminPostRow[] } })),
);

const search = ref(filters.search);
let timer: ReturnType<typeof setTimeout> | undefined;
watch([() => filters.locale, () => filters.status], () => {
  filters.offset = 0;
  refresh();
});
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    filters.search = value.trim();
    filters.offset = 0;
    refresh();
  }, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

const rows = computed(() => data.value?.list.items ?? []);
const total = computed(() => data.value?.list.total ?? 0);
const page = computed(() => Math.floor(filters.offset / limit) + 1);
const last = computed(() => Math.max(1, Math.ceil(total.value / limit)));

const go = (next: number) => {
  filters.offset = Math.min(Math.max(0, next - 1), last.value - 1) * limit;
  refresh();
};
</script>

<template>
  <div>
    <div class="adm__between">
      <h1>Пости</h1>
      <NuxtLink class="adm__btn adm__btn--gold" to="/admin/posts/new">Новий пост</NuxtLink>
    </div>

    <div class="adm__filters">
      <select v-model="filters.status" class="adm__select" aria-label="Статус">
        <option value="">Будь-який статус</option>
        <option value="draft">чернетки</option>
        <option value="published">опубліковані</option>
        <option value="archived">архів</option>
      </select>
      <select v-model="filters.locale" class="adm__select" aria-label="Мова">
        <option value="">Всі мови</option>
        <option value="uk">uk</option>
        <option value="en">en</option>
        <option value="de">de</option>
        <option value="fr">fr</option>
      </select>
      <input v-model="search" class="adm__input" type="search" placeholder="пошук за заголовком, slug, анонсом" maxlength="100">
    </div>

    <p v-if="status === 'pending'" class="adm__muted">Завантаження…</p>
    <p v-else-if="error" class="adm__error" role="alert">{{ (error as Error).message }}</p>

    <AdminPostListTable v-if="rows.length" :rows="rows" />
    <p v-else-if="status === 'success' && !error" class="adm__note">
      Нічого не знайдено. Якщо міграцію <code>0010_blog_engine</code> ще не застосовано, таблиць blog_* просто немає.
    </p>

    <div v-if="total > limit" class="adm__row" style="margin-top: 16px">
      <button type="button" class="adm__btn" :disabled="page <= 1" @click="go(page - 1)">← Новіші</button>
      <span class="adm__muted">{{ page }} / {{ last }} · {{ total }} записів</span>
      <button type="button" class="adm__btn" :disabled="page >= last" @click="go(page + 1)">Старіші →</button>
    </div>
  </div>
</template>

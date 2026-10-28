<script setup lang="ts">
const { $trpc } = useNuxtApp();
const { ask } = useAdminPrompt();

const LIMIT = 25;

const search = ref('');
const status = ref<'all' | 'active' | 'banned' | 'shadowbanned'>('all');
const offset = ref(0);

const { data: page, error, pending, refresh, run } = useConsoleQuery(() =>
  $trpc.admin.users.query({
    query: search.value || undefined,
    status: status.value,
    limit: LIMIT,
    offset: offset.value,
  }),
);

const rows = computed(() => page.value?.rows ?? []);

/** A filter change with a stale offset would ask for page 3 of a result set that just shrank. */
const applyFilters = () => {
  offset.value = 0;
  void refresh();
};

const statusOf = (user: { bannedAt: Date | null; shadowbannedAt: Date | null }) =>
  user.bannedAt ? 'banned' : user.shadowbannedAt ? 'shadowbanned' : 'active';

const setStatus = async (user: any, next: 'active' | 'banned' | 'shadowbanned') => {
  if (next === statusOf(user)) return;
  const reason = await ask({
    title: next === 'banned' ? 'Заблокувати акаунт' : next === 'shadowbanned' ? 'Тіньовий бан' : 'Повернути доступ',
    label: 'Обґрунтування',
    kind: 'textarea',
    minLength: 8,
    maxLength: 500,
    danger: next !== 'active',
    hint: 'Мінімум 8 символів. Текст потрапить в журнал дій адміністратора.',
  });
  if (reason === null) return;
  await run(() => $trpc.admin.setUserStatus.mutate({ userId: user.id, status: next, reason }));
};

const grantVip = async (user: any) => {
  const daysAnswer = await ask({
    title: user.vip ? 'Продовжити VIP' : 'Надати VIP',
    label: 'Тривалість, днів',
    kind: 'number',
    value: '30',
    maxLength: 3,
    hint: 'Ціле число від 1 до 365.',
  });
  if (daysAnswer === null) return;
  const days = Number(daysAnswer);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    error.value = 'Тривалість VIP має бути цілим числом від 1 до 365 днів.';
    return;
  }
  const reason = await ask({
    title: 'Причина надання VIP',
    label: 'Причина',
    kind: 'textarea',
    minLength: 8,
    maxLength: 500,
    hint: 'Видно в журналі дій і потрібна, щоб видача не була анонімною.',
  });
  if (reason === null) return;
  await run(() => $trpc.admin.grantVip.mutate({ userId: user.id, days, reason }));
};
</script>

<template>
  <div class="adm__between">
    <h1>Користувачі</h1>
    <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
  </div>

  <div class="adm__filters">
    <input v-model="search" class="adm__input" type="search" placeholder="Ім’я, місто або ID" @keyup.enter="applyFilters">
    <select v-model="status" class="adm__select" @change="applyFilters">
      <option value="all">Усі статуси</option>
      <option value="active">Активні</option>
      <option value="banned">Заблоковані</option>
      <option value="shadowbanned">Тіньовий бан</option>
    </select>
    <button class="adm__btn" type="button" :disabled="pending" @click="applyFilters">Пошук</button>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !page" class="adm__muted">Оновлюємо дані…</p>

  <section class="adm__panel">
    <table v-if="rows.length" class="adm__table">
      <thead>
        <tr>
          <th>Профіль</th>
          <th>Місто / вік</th>
          <th class="adm__nowrap">Створено</th>
          <th class="adm__nowrap">Остання активність</th>
          <th class="adm__nowrap">Статус</th>
          <th class="adm__nowrap">VIP</th>
          <th>Дія</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in rows" :key="user.id">
          <td>
            <span class="adm__title">{{ user.displayName || 'Без імені' }}</span>
            <span class="adm__mono">{{ user.id }}</span>
          </td>
          <td>{{ user.city || '—' }} · {{ user.age ?? '—' }}</td>
          <td class="adm__nowrap">{{ fmtDate(user.createdAt) }}</td>
          <td class="adm__nowrap">{{ fmtDate(user.lastActiveAt) }}</td>
          <td class="adm__nowrap">
            <span class="adm__chip" :class="`adm__chip--${statusOf(user) === 'active' ? 'ok' : statusOf(user) === 'shadowbanned' ? 'warn' : 'banned'}`">
              {{ statusOf(user) === 'active' ? 'Активний' : statusOf(user) === 'shadowbanned' ? 'Тіньовий бан' : 'Бан' }}
            </span>
          </td>
          <td>
            <span v-if="user.vip">Активний до {{ fmtDate(user.vipExpiresAt) }}</span>
            <span v-else class="adm__muted">Неактивний</span>
          </td>
          <td>
            <div class="adm__actions">
              <NuxtLink :to="`/users/${user.id}`" class="adm__btn">Досьє</NuxtLink>
              <select class="adm__select" :value="statusOf(user)" @change="setStatus(user, ($event.target as HTMLSelectElement).value as any)">
                <option value="active">Активний</option>
                <option value="banned">Заблокувати</option>
                <option value="shadowbanned">Тіньовий бан</option>
              </select>
              <button class="adm__btn adm__btn--gold" type="button" @click="grantVip(user)">
                {{ user.vip ? 'Додати VIP' : 'Надати VIP' }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!pending" class="adm__muted">Користувачів за цим фільтром немає.</p>

    <AdminPager
      v-if="page?.total"
      :total="page.total"
      :limit="LIMIT"
      :offset="offset"
      @update:offset="offset = $event; refresh()"
    />
  </section>
</template>

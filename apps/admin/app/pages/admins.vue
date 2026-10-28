<script setup lang="ts">
import type { CreatedAdmin } from '~/types/admin';

/** Dates are ISO strings at runtime and `Date` in the tRPC types, as in every other table. */
type AdminRow = {
  id: string;
  email: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  isRoot: boolean;
  isEnvListed: boolean;
};

const { $trpc } = useNuxtApp();
const { ask } = useAdminPrompt();

const email = ref('');
const created = ref<CreatedAdmin | null>(null);
const copied = ref(false);

const { data: page, error, pending, refresh, run } = useConsoleQuery(() => $trpc.admin.admins.query());
const rows = computed<AdminRow[]>(() => page.value?.rows ?? []);

const create = async () => {
  const address = email.value.trim();
  if (!address) return;
  const reason = await ask({
    title: 'Додати адміністратора',
    label: 'Навіщо цей доступ',
    kind: 'textarea',
    minLength: 8,
    maxLength: 500,
    hint: 'Мінімум 8 символів. Текст потрапить у журнал дій.',
  });
  if (reason === null) return;

  let result: CreatedAdmin | undefined;
  const ok = await run(async () => {
    result = await $trpc.admin.createAdmin.mutate({ email: address, reason });
  });
  if (!ok || !result) return;

  created.value = result;
  copied.value = false;
  email.value = '';
};

const revoke = async (row: AdminRow) => {
  const reason = await ask({
    title: `Відкликати доступ ${row.email ?? row.id}`,
    label: 'Причина',
    kind: 'textarea',
    minLength: 8,
    maxLength: 500,
    danger: true,
    hint: 'Активна сесія завершиться одразу, пароль перестане діяти.',
  });
  if (reason === null) return;
  await run(() => $trpc.admin.revokeAdmin.mutate({ userId: row.id, reason }));
};

const copyPassword = async () => {
  if (!created.value) return;
  try {
    await navigator.clipboard.writeText(created.value.password);
    copied.value = true;
  } catch {
    copied.value = false;
  }
};
</script>

<template>
  <div class="adm__between">
    <h1>Адміністратори</h1>
    <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !page" class="adm__muted">Оновлюємо дані…</p>

  <section class="adm__panel">
    <h2>Додати адміністратора</h2>
    <p class="adm__muted">
      Пароль генерується на сервері й показується один раз — передай його новому адміну безпечним каналом.
      Наявні акаунти не підвищуються: потрібна вільна пошта.
    </p>
    <form class="adm__filters" @submit.prevent="create">
      <input
        v-model="email"
        class="adm__input"
        type="email"
        placeholder="colleague@example.com"
        autocomplete="off"
        required
        :disabled="pending"
      >
      <button class="adm__btn adm__btn--gold" type="submit" :disabled="pending || !email.trim()">Створити</button>
    </form>
  </section>

  <section v-if="created" class="adm__panel">
    <h2>Пароль для {{ created.email }}</h2>
    <p class="adm__muted">Показується лише зараз: у базі лежить хеш, відновити пароль неможливо. Відкликати доступ і створити нового адміна — єдиний шлях, якщо пароль загубився.</p>
    <p class="adm__mono">{{ created.password }}</p>
    <div class="adm__actions">
      <button class="adm__btn adm__btn--gold" type="button" @click="copyPassword">
        {{ copied ? 'Скопійовано' : 'Копіювати' }}
      </button>
      <button class="adm__btn" type="button" @click="created = null">Закрити</button>
    </div>
  </section>

  <section class="adm__panel">
    <table v-if="rows.length" class="adm__table">
      <thead>
        <tr>
          <th>Пошта</th>
          <th>Джерело</th>
          <th class="adm__nowrap">Створено</th>
          <th class="adm__nowrap">Останній вхід</th>
          <th>Дія</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>
            <span class="adm__title">{{ row.email || 'Без пошти' }}</span>
            <span class="adm__mono">{{ row.id }}</span>
          </td>
          <td>
            <span v-if="row.isRoot" class="adm__chip adm__chip--ok">root · .env</span>
            <span v-else-if="row.isEnvListed" class="adm__chip adm__chip--warn">env-список</span>
            <span v-else class="adm__chip adm__chip--ok">консоль</span>
          </td>
          <td class="adm__nowrap">{{ fmtDate(row.createdAt) }}</td>
          <td class="adm__nowrap">{{ fmtDate(row.lastLoginAt) }}</td>
          <td>
            <div class="adm__actions">
              <span v-if="row.isRoot" class="adm__muted">Керується через ADMIN_EMAIL</span>
              <span v-else-if="row.isEnvListed" class="adm__muted">Керується через ADMIN_USER_IDS</span>
              <button
                v-else
                class="adm__btn"
                type="button"
                :disabled="pending"
                @click="revoke(row)"
              >
                Відкликати
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!pending" class="adm__muted">Адмінів поки немає.</p>
  </section>
</template>

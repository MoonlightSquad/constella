<script setup lang="ts">
const { $trpc } = useNuxtApp();

const LIMIT = 50;
const offset = ref(0);

const { data: page, error, pending, refresh } = useConsoleQuery(() =>
  $trpc.admin.payments.query({ limit: LIMIT, offset: offset.value }),
);

const rows = computed(() => page.value?.rows ?? []);
</script>

<template>
  <div class="adm__between">
    <h1>Платежі</h1>
    <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !page" class="adm__muted">Оновлюємо дані…</p>

  <section class="adm__panel">
    <table v-if="rows.length" class="adm__table">
      <thead>
        <tr>
          <th>Покупець</th>
          <th>Товар</th>
          <th class="adm__nowrap">Сума</th>
          <th class="adm__nowrap">Час</th>
          <th class="adm__nowrap">Тип</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="payment in rows" :key="payment.id">
          <td>
            <span class="adm__title">{{ payment.displayName || payment.userId }}</span>
            <span class="adm__mono">{{ payment.userId }}</span>
          </td>
          <td>{{ payment.plan || payment.sku }}</td>
          <td class="adm__nowrap">{{ fmtNumber(payment.stars) }} {{ payment.currency }}</td>
          <td class="adm__nowrap">{{ fmtDate(payment.paidAt) }}</td>
          <td class="adm__nowrap">{{ payment.recurring ? 'Підписка' : 'Разова' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="!pending" class="adm__muted">Оплат ще немає.</p>

    <AdminPager
      v-if="page?.total"
      :total="page.total"
      :limit="LIMIT"
      :offset="offset"
      @update:offset="offset = $event; refresh()"
    />
  </section>
</template>

<script setup lang="ts">
const { $trpc } = useNuxtApp();

const { data: stats, error, pending, refresh } = useConsoleQuery(() => $trpc.admin.overview.query());
</script>

<template>
  <div class="adm__between">
    <h1>Огляд</h1>
    <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !stats" class="adm__muted">Оновлюємо дані…</p>

  <div v-if="stats" class="adm__grid adm__grid--cards">
    <article class="adm__card">
      <span>Усього користувачів</span>
      <strong>{{ fmtNumber(stats.totalUsers) }}</strong>
      <small>Заповнили профіль: {{ fmtNumber(stats.onboardedUsers) }}</small>
    </article>
    <article class="adm__card">
      <span>Активні за добу</span>
      <strong>{{ fmtNumber(stats.activeToday) }}</strong>
      <small>За останні 24 години</small>
    </article>
    <article class="adm__card">
      <span>Відкриті скарги</span>
      <strong>{{ fmtNumber(stats.openReports) }}</strong>
      <small>Усього скарг: {{ fmtNumber(stats.totalReports) }}</small>
    </article>
    <article class="adm__card">
      <span>Оплати за 30 днів</span>
      <strong>{{ fmtNumber(stats.payments30d) }}</strong>
      <small>{{ fmtNumber(stats.stars30d) }} Telegram Stars</small>
    </article>
    <article class="adm__card">
      <span>Обмежені акаунти</span>
      <strong>{{ fmtNumber(stats.bannedUsers + stats.shadowbannedUsers) }}</strong>
      <small>Бан: {{ fmtNumber(stats.bannedUsers) }} · тіньовий: {{ fmtNumber(stats.shadowbannedUsers) }}</small>
    </article>
  </div>
</template>

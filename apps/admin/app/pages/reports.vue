<script setup lang="ts">
const { $trpc } = useNuxtApp();
const { ask } = useAdminPrompt();

const LIMIT = 25;

const status = ref<'all' | 'open' | 'reviewing' | 'resolved' | 'dismissed'>('open');
const offset = ref(0);

const { data: page, error, pending, refresh, run } = useConsoleQuery(() =>
  $trpc.admin.reports.query({ status: status.value, limit: LIMIT, offset: offset.value }),
);

const rows = computed(() => page.value?.rows ?? []);

const REVIEW_ACTIONS = [
  { status: 'reviewing', label: 'Взяти' },
  { status: 'resolved', label: 'Вирішити' },
  { status: 'dismissed', label: 'Відхилити' },
] as const;

const review = async (report: any, next: 'reviewing' | 'resolved' | 'dismissed') => {
  const note = await ask({
    title: `Скарга #${report.id} — ${labelFor(next)}`,
    label: 'Нотатка модератора',
    kind: 'textarea',
    maxLength: 1000,
    hint: 'Необов’язково. Якщо залишиш порожньо, у журналі не буде пояснення.',
  });
  if (note === null) return;
  await run(() => $trpc.admin.reviewReport.mutate({ reportId: report.id, status: next, note }));
};

const labelFor = (next: 'reviewing' | 'resolved' | 'dismissed') =>
  next === 'reviewing' ? 'взяти в роботу' : next === 'resolved' ? 'вирішено' : 'відхилено';
</script>

<template>
  <div class="adm__between">
    <h1>Скарги</h1>
    <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
  </div>

  <div class="adm__filters">
    <select v-model="status" class="adm__select" @change="offset = 0; refresh()">
      <option value="open">Відкриті</option>
      <option value="reviewing">На розгляді</option>
      <option value="resolved">Вирішені</option>
      <option value="dismissed">Відхилені</option>
      <option value="all">Усі</option>
    </select>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !page" class="adm__muted">Оновлюємо дані…</p>

  <section class="adm__panel">
    <template v-if="rows.length">
      <article v-for="report in rows" :key="report.id" class="adm__entry">
        <div>
          <strong>#{{ report.id }} · {{ report.reason }}</strong>
          <span class="adm__muted">{{ fmtDate(report.createdAt) }} · {{ report.reporterName || 'Користувач' }}</span>
          <p>{{ report.details || 'Без додаткових деталей' }}</p>
          <span class="adm__mono">акаунт {{ report.reportedUserId }} · статус {{ report.status }}</span>
          <p v-if="report.moderatorNote" class="adm__hint">Нотатка: {{ report.moderatorNote }}</p>
        </div>
        <div class="adm__actions">
          <button
            v-for="action in REVIEW_ACTIONS"
            :key="action.status"
            class="adm__btn"
            type="button"
            :disabled="report.status === action.status"
            @click="review(report, action.status)"
          >{{ action.label }}</button>
        </div>
      </article>
    </template>
    <p v-else-if="!pending" class="adm__muted">Скарг у цій черзі немає.</p>

    <AdminPager
      v-if="page?.total"
      :total="page.total"
      :limit="LIMIT"
      :offset="offset"
      @update:offset="offset = $event; refresh()"
    />
  </section>
</template>

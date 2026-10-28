<script setup lang="ts">
const { $trpc } = useNuxtApp();

const LIMIT = 50;
const offset = ref(0);

const { data: page, error, pending, refresh } = useConsoleQuery(() =>
  $trpc.admin.audit.query({ limit: LIMIT, offset: offset.value }),
);

const entries = computed(() => (page.value?.rows ?? []).map((entry) => ({
  ...entry,
  metaText: entry.metadata && typeof entry.metadata === 'object'
    ? JSON.stringify(entry.metadata).slice(1, -1)
    : '',
})));
</script>

<template>
  <div class="adm__between">
    <h1>Журнал дій</h1>
    <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !page" class="adm__muted">Оновлюємо дані…</p>

  <section class="adm__panel">
    <template v-if="entries.length">
      <article v-for="entry in entries" :key="entry.id" class="adm__entry">
        <div>
          <strong>{{ entry.action }}</strong>
          <span class="adm__muted">{{ fmtDate(entry.createdAt) }} · {{ entry.actorName || entry.actorId }}</span>
          <p>{{ entry.reason || 'Без примітки' }}</p>
          <span v-if="entry.targetUserId" class="adm__mono">користувач {{ entry.targetUserId }}</span>
          <span v-if="entry.reportId" class="adm__mono">скарга #{{ entry.reportId }}</span>
          <span v-if="entry.metaText" class="adm__mono">{{ entry.metaText }}</span>
        </div>
      </article>
    </template>
    <p v-else-if="!pending" class="adm__muted">Записів поки немає.</p>

    <AdminPager
      v-if="page?.total"
      :total="page.total"
      :limit="LIMIT"
      :offset="offset"
      @update:offset="offset = $event; refresh()"
    />
  </section>
</template>

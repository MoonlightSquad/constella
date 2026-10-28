<script setup lang="ts">
const { $trpc } = useNuxtApp();

const LIMIT = 100;
const offset = ref(0);

const status = ref<'all' | 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed'>('all');

const { data: page, error, pending, refresh } = useConsoleQuery(() =>
  $trpc.support.adminQueue.query({ status: status.value, limit: LIMIT, offset: offset.value }),
);

const tickets = computed(() => page.value?.rows ?? []);

const active = ref<any>(null);
const messages = ref<any[]>([]);
const reply = ref('');
const nextStatus = ref<'in_progress' | 'waiting_user' | 'resolved' | 'closed'>('waiting_user');
const threadError = ref('');
const sending = ref(false);

/** Only a live ticket can be replied to with a status; resolved/closed stay as they are. */
const statusForTicket = (current: string) =>
  current === 'resolved' || current === 'closed' ? current : 'waiting_user';

const openTicket = async (ticket: { id: string }) => {
  threadError.value = '';
  try {
    const result = await $trpc.support.adminThread.query({ ticketId: ticket.id });
    active.value = result.ticket;
    messages.value = result.messages;
    nextStatus.value = statusForTicket(result.ticket.status) as any;
  } catch (cause: any) {
    threadError.value = cause?.message || 'Не вдалося відкрити звернення.';
  }
};

const sendReply = async () => {
  const ticket = active.value;
  if (!ticket || !reply.value.trim()) return;
  sending.value = true;
  threadError.value = '';
  try {
    await $trpc.support.adminReply.mutate({ ticketId: ticket.id, body: reply.value, status: nextStatus.value });
    reply.value = '';
    await openTicket(ticket);
    await refresh();
  } catch (cause: any) {
    threadError.value = cause?.message || 'Не вдалося надіслати відповідь.';
  } finally {
    sending.value = false;
  }
};

watch(status, () => {
  offset.value = 0;
  void refresh();
});

const route = useRoute();

// The user dossier links straight to one ticket, and the queue below is filtered and paginated,
// so the thread opens by id instead of hunting for its row.
onMounted(() => {
  const ticketId = String(route.query.ticket ?? '');
  if (ticketId) void openTicket({ id: ticketId });
});
</script>

<template>
  <div class="adm__between">
    <h1>Підтримка</h1>
    <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
  </div>

  <div class="adm__filters">
    <select v-model="status" class="adm__select">
      <option value="all">Усі статуси</option>
      <option value="open">Відкриті</option>
      <option value="in_progress">У роботі</option>
      <option value="waiting_user">Чекають на користувача</option>
      <option value="resolved">Вирішені</option>
      <option value="closed">Закриті</option>
    </select>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !page" class="adm__muted">Оновлюємо дані…</p>

  <div class="adm__support">
    <div class="adm__queue">
      <button
        v-for="ticket in tickets"
        :key="ticket.id"
        class="adm__queue__item"
        :class="{ 'adm__queue__item--on': active?.id === ticket.id }"
        type="button"
        @click="openTicket(ticket)"
      >
        <strong>{{ ticket.subject }}</strong>
        <span class="adm__muted">{{ ticket.displayName || ticket.userId }} · {{ ticket.status }}</span>
        <small class="adm__hint">{{ ticket.category }} · {{ fmtDate(ticket.updatedAt) }}</small>
      </button>
      <p v-if="!tickets.length && !pending" class="adm__muted">Звернень немає.</p>
      <AdminPager
        v-if="page?.total"
        :total="page.total"
        :limit="LIMIT"
        :offset="offset"
        @update:offset="offset = $event; refresh()"
      />
    </div>

    <section v-if="active" class="adm__panel">
      <h2>{{ active.subject }}</h2>
      <p class="adm__muted">{{ active.displayName || active.userId }} · {{ active.category }} · {{ active.status }}</p>
      <p v-if="threadError" class="adm__error">{{ threadError }}</p>

      <article v-for="message in messages" :key="message.id" class="adm__message">
        <small class="adm__muted">
          {{ message.authorRole === 'support' ? 'Служба підтримки' : 'Користувач' }} · {{ fmtDate(message.createdAt) }}
        </small>
        <p>{{ message.body }}</p>
      </article>

      <form class="adm__stack" @submit.prevent="sendReply">
        <textarea v-model="reply" class="adm__area" rows="4" maxlength="5000" required placeholder="Ваша відповідь…" />
        <select v-model="nextStatus" class="adm__select">
          <option value="in_progress">У роботі</option>
          <option value="waiting_user">Очікуємо на користувача</option>
          <option value="resolved">Вирішено</option>
          <option value="closed">Закрито</option>
        </select>
        <div class="adm__row adm__row--end">
          <button class="adm__btn adm__btn--gold" type="submit" :disabled="sending || !reply.trim()">
            {{ sending ? 'Надсилаємо…' : 'Надіслати відповідь' }}
          </button>
        </div>
      </form>
    </section>

    <p v-else class="adm__muted">Оберіть звернення зі списку.</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
const emit = defineEmits<{ close: [] }>()
const { $trpc } = useNuxtApp() as any
const tickets = ref<any[]>([]), selected = ref<any>(null), messages = ref<any[]>([])
const loading = ref(false), issue = ref(''), subject = ref(''), category = ref('general'), draft = ref(''), creating = ref(false)
const loadTickets = async () => { tickets.value = await $trpc.support.mine.query() }
const openTicket = async (ticket: any) => {
  loading.value = true; issue.value = ''
  try { const result = await $trpc.support.thread.query({ ticketId: ticket.id }); selected.value = result.ticket; messages.value = result.messages }
  catch (e: any) { issue.value = e?.message || 'Не вдалося завантажити звернення.' }
  finally { loading.value = false }
}
const createTicket = async () => {
  if (creating.value) return
  creating.value = true; issue.value = ''
  try { const ticket = await $trpc.support.create.mutate({ subject: subject.value, category: category.value, message: draft.value }); subject.value = ''; draft.value = ''; await loadTickets(); await openTicket(ticket) }
  catch (e: any) { issue.value = e?.message || 'Не вдалося створити звернення.' }
  finally { creating.value = false }
}
const reply = async () => {
  if (!selected.value || !draft.value.trim()) return
  try { await $trpc.support.reply.mutate({ ticketId: selected.value.id, body: draft.value }); draft.value = ''; await openTicket(selected.value); await loadTickets() }
  catch (e: any) { issue.value = e?.message || 'Не вдалося надіслати відповідь.' }
}
const closeTicket = async () => {
  if (!selected.value) return
  try { await $trpc.support.close.mutate({ ticketId: selected.value.id }); await loadTickets(); await openTicket(selected.value) }
  catch (e: any) { issue.value = e?.message || 'Не вдалося закрити звернення.' }
}
const statusLabel = (s: string) => ({ open: 'Відкрито', in_progress: 'У роботі', waiting_user: 'Очікуємо на вас', resolved: 'Вирішено', closed: 'Закрито' } as any)[s] || s
const date = (v: string | Date) => new Date(v).toLocaleString('uk-UA')
onMounted(() => { void loadTickets() })
</script>
<template>
<section class="support"><header><div><p class="eyebrow">CONSTELLA · SUPPORT</p><h1>Підтримка</h1><p>Створіть звернення, команда відповість тут.</p></div><button class="secondary" @click="emit('close')">Назад</button></header>
<p v-if="issue" class="error" role="alert">{{ issue }}</p>
<div class="layout"><aside class="ticket-list"><h2>Ваші звернення</h2><button v-for="ticket in tickets" :key="ticket.id" class="ticket" :class="{ selected: selected?.id === ticket.id }" @click="openTicket(ticket)"><strong>{{ ticket.subject }}</strong><span>{{ statusLabel(ticket.status) }} · {{ date(ticket.updatedAt) }}</span></button><p v-if="!tickets.length" class="muted">Звернень ще немає.</p></aside>
<div class="conversation"><template v-if="selected"><div class="title"><div><h2>{{ selected.subject }}</h2><span>{{ statusLabel(selected.status) }} · {{ selected.category }}</span></div><button v-if="selected.status !== 'closed'" class="secondary" @click="closeTicket">Закрити</button></div>
<div class="messages"><article v-for="message in messages" :key="message.id" :class="message.authorRole"><small>{{ message.authorRole === 'support' ? 'Constella Support' : 'Ви' }} · {{ date(message.createdAt) }}</small><p>{{ message.body }}</p></article></div>
<form v-if="selected.status !== 'closed'" class="composer" @submit.prevent="reply"><textarea v-model="draft" maxlength="5000" rows="3" placeholder="Напишіть відповідь..." required/><button class="primary" :disabled="!draft.trim()">Надіслати</button></form><p v-else class="muted">Звернення закрито.</p></template>
<form v-else class="new-ticket" @submit.prevent="createTicket"><h2>Нове звернення</h2><label>Тема<input v-model.trim="subject" minlength="5" maxlength="120" required placeholder="Коротко опишіть питання"/></label><label>Категорія<select v-model="category"><option value="general">Загальне питання</option><option value="account">Акаунт</option><option value="billing">Оплата</option><option value="safety">Безпека</option><option value="technical">Технічна проблема</option></select></label><label>Повідомлення<textarea v-model="draft" maxlength="5000" rows="5" required placeholder="Опишіть, що сталося..."/></label><button class="primary" :disabled="creating">{{ creating ? 'Створюємо...' : 'Створити звернення' }}</button></form></div></div></section>
</template>
<style scoped>
.support{max-width:1080px;margin:auto;padding:24px 0;color:#eef3ef}.support header{display:flex;justify-content:space-between;align-items:start;gap:20px;margin-bottom:24px}.eyebrow{color:#e2b36b;font-size:10px;font-weight:800;letter-spacing:.15em}.support h1{margin:8px 0;font-size:30px}.support header p:last-child,.muted{color:#9badaa;font-size:13px}.layout{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.5fr);gap:16px}.ticket-list,.conversation{border:1px solid #2b3d3d;border-radius:16px;background:#111c1e;padding:18px;min-width:0}.ticket-list h2,.new-ticket h2{font-size:17px;margin:0 0 14px}.ticket{display:grid;text-align:left;width:100%;border:1px solid transparent;border-radius:10px;padding:12px;background:#172426;color:#eef3ef;margin:8px 0;cursor:pointer}.ticket.selected{border-color:#82c7b7}.ticket span,.title span{font-size:11px;color:#98aaa6;margin-top:6px}.title{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #293a3b;padding-bottom:14px}.title h2{margin:0;font-size:18px}.messages{display:grid;gap:12px;max-height:50vh;overflow:auto;padding:14px 0}.messages article{max-width:90%;padding:12px;border-radius:12px;background:#182729}.messages article.user{justify-self:end;background:#23413d}.messages small{color:#9badaa;font-size:10px}.messages p{white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0 0;font-size:13px;line-height:1.5}.composer,.new-ticket{display:grid;gap:12px}.new-ticket label{display:grid;gap:7px;font-size:12px;color:#c4d1cc}.support input,.support select,.support textarea{width:100%;border:1px solid #354949;border-radius:9px;background:#0c1516;color:#eef3ef;padding:11px}.primary,.secondary{border:0;border-radius:9px;padding:11px 15px;font-weight:700}.primary{background:#d9ad6d;color:#18201e}.secondary{background:#172526;color:#eef3ef;border:1px solid #354949}.primary:disabled{opacity:.55}.error{color:#ff9a8e}@media(max-width:680px){.layout{grid-template-columns:1fr}.support{padding:12px 0}.messages{max-height:38vh}}
</style>

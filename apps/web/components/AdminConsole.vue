<script setup lang="ts">
import { onMounted, ref } from 'vue'

const emit = defineEmits<{ exit: [] }>()
const { $trpc } = useNuxtApp() as any
const section = ref<'overview' | 'users' | 'reports' | 'payments' | 'audit' | 'support' | 'photos'>('overview')
const loading = ref(false)
const error = ref('')
const stats = ref<any>(null)
const users = ref<any[]>([])
const reports = ref<any[]>([])
const payments = ref<any[]>([])
const audit = ref<any[]>([])
const photoQueue = ref<any[]>([])
const supportTickets = ref<any[]>([])
const activeTicket = ref<any>(null)
const ticketMessages = ref<any[]>([])
const supportReply = ref('')
const supportStatus = ref('waiting_user')
const query = ref('')
const userStatus = ref<'all' | 'active' | 'banned' | 'shadowbanned'>('all')
const reportStatus = ref<'all' | 'open' | 'reviewing' | 'resolved' | 'dismissed'>('open')
const isAdmin = ref<boolean | null>(null)

const refresh = async () => {
  loading.value = true
  error.value = ''
  try {
    isAdmin.value = (await $trpc.admin.access.query()).isAdmin
    if (!isAdmin.value) return
    if (section.value === 'overview') stats.value = await $trpc.admin.overview.query()
    if (section.value === 'users') users.value = (await $trpc.admin.users.query({ query: query.value || undefined, status: userStatus.value })).rows
    if (section.value === 'reports') reports.value = await $trpc.admin.reports.query({ status: reportStatus.value })
    if (section.value === 'payments') payments.value = await $trpc.admin.payments.query({ limit: 50, offset: 0 })
    if (section.value === 'audit') audit.value = await $trpc.admin.audit.query({ limit: 50, offset: 0 })
    if (section.value === 'support') supportTickets.value = await $trpc.support.adminQueue.query({ status: 'all', limit: 100, offset: 0 })
    if (section.value === 'photos') photoQueue.value = await $trpc.admin.photoQueue.query({ status: 'pending', limit: 100, offset: 0 })
  } catch (cause: any) { error.value = cause?.message || 'Не вдалося завантажити дані.' }
  finally { loading.value = false }
}
const setStatus = async (user: any, status: 'active' | 'banned' | 'shadowbanned') => {
  const reason = window.prompt('Обґрунтування (мінімум 8 символів):')
  if (!reason) return
  try {
    await $trpc.admin.setUserStatus.mutate({ userId: user.id, status, reason })
    await refresh()
  } catch (cause: any) { error.value = cause?.message || 'Не вдалося змінити статус.' }
}
const review = async (report: any, status: 'reviewing' | 'resolved' | 'dismissed') => {
  const note = window.prompt('Нотатка модератора (необов’язково):') || ''
  try {
    await $trpc.admin.reviewReport.mutate({ reportId: report.id, status, note })
    await refresh()
  } catch (cause: any) { error.value = cause?.message || 'Не вдалося оновити скаргу.' }
}
const openTicket = async (ticket: any) => { try { const result = await $trpc.support.adminThread.query({ ticketId: ticket.id }); activeTicket.value = result.ticket; ticketMessages.value = result.messages; supportStatus.value = result.ticket.status === 'resolved' || result.ticket.status === 'closed' ? result.ticket.status : 'waiting_user' } catch (cause: any) { error.value = cause?.message || 'Unable to open ticket.' } }
const replyTicket = async () => { if (!activeTicket.value || !supportReply.value.trim()) return; try { await $trpc.support.adminReply.mutate({ ticketId: activeTicket.value.id, body: supportReply.value, status: supportStatus.value }); supportReply.value = ''; await refresh(); await openTicket(activeTicket.value) } catch (cause: any) { error.value = cause?.message || 'Unable to reply.' } }
const reviewPhoto = async (photo: any, status: 'approved' | 'rejected') => { const reason = window.prompt('Причина рішення (мінімум 4 символи):'); if (!reason) return; try { await $trpc.admin.reviewPhoto.mutate({ photoId: photo.id, status, reason }); await refresh() } catch (cause: any) { error.value = cause?.message || 'Не вдалося оновити фото.' } }
const date = (value: string | Date | null) => value ? new Date(value).toLocaleString('uk-UA') : '—'
onMounted(refresh)
</script>

<template>
  <div class="admin-shell">
    <header><div><span class="brand">✦ CONSTELLA</span><h1>Панель управління</h1><p>Користувачі, безпека та операційні показники</p></div><button class="back" @click="emit('exit')">← До продукту</button></header>
    <div v-if="isAdmin === false" class="notice"><h2>Доступ закритий</h2><p>Ваш обліковий запис не входить до серверного списку адміністраторів.</p></div>
    <template v-else-if="isAdmin">
      <nav class="sections">
        <button v-for="item in [['overview','Огляд'],['users','Користувачі'],['reports','Скарги'],['payments','Платежі'],['audit','Журнал дій'],['support','Підтримка'],['photos','Фото']]" :key="item[0]" :class="{ active: section === item[0] }" @click="section = item[0] as any; refresh()">{{ item[1] }}</button>
      </nav>
      <p v-if="error" class="error">{{ error }}</p><p v-if="loading" class="muted">Оновлюємо дані…</p>
      <section v-if="section === 'overview' && stats" class="cards">
        <article><span>Усього користувачів</span><strong>{{ stats.totalUsers }}</strong><small>Заповнили профіль: {{ stats.onboardedUsers }}</small></article>
        <article><span>Активні за добу</span><strong>{{ stats.activeToday }}</strong><small>За останні 24 години</small></article>
        <article><span>Відкриті скарги</span><strong>{{ stats.openReports }}</strong><small>Усього скарг: {{ stats.totalReports }}</small></article>
        <article><span>Оплати за 30 днів</span><strong>{{ stats.payments30d }}</strong><small>{{ stats.stars30d }} Telegram Stars</small></article>
        <article><span>Обмежені акаунти</span><strong>{{ stats.bannedUsers + stats.shadowbannedUsers }}</strong><small>Бан: {{ stats.bannedUsers }} · тіньовий: {{ stats.shadowbannedUsers }}</small></article>
      </section>
      <section v-else-if="section === 'users'" class="panel">
        <div class="filters"><input v-model="query" placeholder="Ім’я, місто або ID" @keyup.enter="refresh"><select v-model="userStatus" @change="refresh"><option value="all">Усі статуси</option><option value="active">Активні</option><option value="banned">Заблоковані</option><option value="shadowbanned">Тіньовий бан</option></select><button @click="refresh">Пошук</button></div>
        <div class="table-wrap"><table><thead><tr><th>Профіль</th><th>Місто / вік</th><th>Створено</th><th>Остання активність</th><th>Статус</th><th>Дія</th></tr></thead><tbody><tr v-for="user in users" :key="user.id"><td>{{ user.displayName || 'Без імені' }}<small>{{ user.id }}</small></td><td>{{ user.city || '—' }} · {{ user.age ?? '—' }}</td><td>{{ date(user.createdAt) }}</td><td>{{ date(user.lastActiveAt) }}</td><td>{{ user.bannedAt ? 'Бан' : user.shadowbannedAt ? 'Тіньовий бан' : 'Активний' }}</td><td><select :value="user.bannedAt ? 'banned' : user.shadowbannedAt ? 'shadowbanned' : 'active'" @change="setStatus(user, ($event.target as HTMLSelectElement).value as any)"><option value="active">Активний</option><option value="banned">Заблокувати</option><option value="shadowbanned">Тіньовий бан</option></select></td></tr></tbody></table></div>
      </section>
      <section v-else-if="section === 'reports'" class="panel">
        <div class="filters"><select v-model="reportStatus" @change="refresh"><option value="open">Відкриті</option><option value="reviewing">На розгляді</option><option value="resolved">Вирішені</option><option value="dismissed">Відхилені</option><option value="all">Усі</option></select><button @click="refresh">Оновити</button></div>
        <article v-for="report in reports" :key="report.id" class="report"><div><strong>#{{ report.id }} · {{ report.reason }}</strong><span>{{ date(report.createdAt) }} · {{ report.reporterName || 'Користувач' }}</span><p>{{ report.details || 'Без додаткових деталей' }}</p><small>Акаунт: {{ report.reportedUserId }} · Статус: {{ report.status }}</small><p v-if="report.moderatorNote">Нотатка: {{ report.moderatorNote }}</p></div><div class="actions"><button @click="review(report, 'reviewing')">Взяти</button><button @click="review(report, 'resolved')">Вирішити</button><button @click="review(report, 'dismissed')">Відхилити</button></div></article><p v-if="!reports.length" class="muted">Скарг у цій черзі немає.</p>
      </section>
      <section v-else-if="section === 'payments'" class="panel table-wrap"><table><thead><tr><th>Покупець</th><th>Товар</th><th>Сума</th><th>Час</th><th>Тип</th></tr></thead><tbody><tr v-for="payment in payments" :key="payment.id"><td>{{ payment.displayName || payment.userId }}</td><td>{{ payment.plan || payment.sku }}</td><td>{{ payment.stars }} {{ payment.currency }}</td><td>{{ date(payment.paidAt) }}</td><td>{{ payment.recurring ? 'Підписка' : 'Разова' }}</td></tr></tbody></table><p v-if="!payments.length" class="muted">Оплат ще немає.</p></section>
      <section v-else-if="section === 'support'" class="panel support-panel"><h2>Support queue</h2><div class="support-layout"><div class="support-queue"><button v-for="ticket in supportTickets" :key="ticket.id" class="support-ticket" :class="{ active: activeTicket?.id === ticket.id }" @click="openTicket(ticket)"><strong>{{ ticket.subject }}</strong><span>{{ ticket.displayName || ticket.userId }} · {{ ticket.status }}</span><small>{{ ticket.category }} · {{ date(ticket.updatedAt) }}</small></button><p v-if="!supportTickets.length" class="muted">No tickets.</p></div><div v-if="activeTicket" class="support-thread"><h3>{{ activeTicket.subject }}</h3><p>{{ activeTicket.displayName || activeTicket.userId }} · {{ activeTicket.category }} · {{ activeTicket.status }}</p><article v-for="message in ticketMessages" :key="message.id" class="support-message"><small>{{ message.authorRole === 'support' ? 'Support team' : 'User' }} · {{ date(message.createdAt) }}</small><p>{{ message.body }}</p></article><form @submit.prevent="replyTicket"><textarea v-model="supportReply" rows="4" maxlength="5000" required placeholder="Your reply..." /><select v-model="supportStatus"><option value="in_progress">In progress</option><option value="waiting_user">Waiting for user</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><button class="primary" type="submit">Send reply</button></form></div><div v-else class="muted">Select a ticket.</div></div></section>
      <section v-else-if="section === 'audit'" class="panel"><article v-for="entry in audit" :key="entry.id" class="audit"><strong>{{ entry.action }}</strong><span>{{ date(entry.createdAt) }} · {{ entry.actorName || entry.actorId }}</span><p>{{ entry.reason || 'Без примітки' }} <small v-if="entry.targetUserId"> · Користувач {{ entry.targetUserId }}</small><small v-if="entry.reportId"> · Скарга #{{ entry.reportId }}</small></p></article><p v-if="!audit.length" class="muted">Записів поки немає.</p></section>
    </template>
    <div v-else-if="error" class="notice error">{{ error }}</div>
  </div>
</template>

<style scoped>
.admin-shell{min-height:100svh;background:#0b1214;color:#edf2ed;padding:clamp(20px,5vw,64px);font:15px Manrope,system-ui,sans-serif}.admin-shell header{display:flex;justify-content:space-between;align-items:center;max-width:1440px;margin:0 auto 34px}.brand{color:#e5b66d;letter-spacing:.12em;font-weight:800}.admin-shell h1{font-size:clamp(28px,4vw,42px);margin:14px 0 4px}.admin-shell header p,.muted{color:#9aabaa}.back,.sections button,.filters button,.actions button{background:#172325;color:#edf2ed;border:1px solid #344547;border-radius:12px;padding:11px 16px;cursor:pointer}.sections{display:flex;gap:8px;max-width:1440px;margin:0 auto 22px;overflow:auto}.sections button.active{background:#d9aa64;color:#15201e;border-color:#d9aa64;font-weight:700}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;max-width:1440px;margin:auto}.cards article,.panel,.notice{background:#111c1e;border:1px solid #273638;border-radius:18px;padding:20px}.cards article{display:grid;gap:10px}.cards span,.cards small,.report span,.audit span{color:#9aabaa}.cards strong{font-size:34px}.panel{max-width:1440px;margin:auto}.filters{display:flex;gap:10px;margin-bottom:18px}.filters input,.filters select,.panel select{background:#0b1214;border:1px solid #344547;border-radius:10px;color:#edf2ed;padding:11px}.filters input{flex:1}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:780px}th,td{text-align:left;padding:13px;border-bottom:1px solid #273638}th{color:#9aabaa;font-weight:600}td small{display:block;color:#809091;font-size:11px;max-width:250px;overflow-wrap:anywhere;margin-top:4px}.report,.audit{display:flex;justify-content:space-between;gap:22px;border-bottom:1px solid #273638;padding:18px 0}.report span,.audit span{display:block;font-size:13px;margin-top:5px}.report p,.audit p{margin:10px 0}.actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.actions button{font-size:12px;padding:9px}.notice{max-width:700px;margin:60px auto}.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}.photo-grid article{display:grid;gap:8px;background:#0b1214;border:1px solid #344547;border-radius:12px;padding:12px}.photo-grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}.photo-grid small{color:#9aabaa}.support-layout{display:grid;grid-template-columns:minmax(230px,.8fr) minmax(0,1.3fr);gap:14px}.support-queue{display:grid;align-content:start;gap:8px}.support-ticket{display:grid;text-align:left;gap:5px;background:#0b1214;border:1px solid #344547;border-radius:10px;color:#edf2ed;padding:12px;cursor:pointer}.support-ticket.active{border-color:#82c7b7}.support-ticket span,.support-ticket small,.support-message small{color:#9aabaa;font-size:11px}.support-thread{min-width:0}.support-thread h3{margin:0}.support-thread>p{color:#9aabaa;font-size:12px}.support-message{border-radius:10px;background:#172325;padding:12px;margin:10px 0}.support-message p{white-space:pre-wrap;overflow-wrap:anywhere}.support-thread form{display:grid;gap:10px}.support-thread textarea,.support-thread select{width:100%;background:#0b1214;border:1px solid #344547;border-radius:10px;color:#edf2ed;padding:11px}.primary{background:#d9aa64;color:#15201e;border:0;border-radius:10px;padding:11px;font-weight:700}.error{color:#ff9f9f}@media(max-width:700px){.support-layout{grid-template-columns:1fr}}.admin-shell button:hover{filter:brightness(1.2)}@media(max-width:700px){.admin-shell header{align-items:flex-start;gap:12px}.back{font-size:12px;padding:9px}.filters{flex-wrap:wrap}.filters input{min-width:100%}.report{flex-direction:column}.actions button{flex:1}}
</style>

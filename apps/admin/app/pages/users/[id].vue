<script setup lang="ts">
const { $trpc } = useNuxtApp();
const { ask } = useAdminPrompt();
const route = useRoute();
const router = useRouter();

const userId = String(route.params.id ?? '');
const LIMIT = 12;
const offset = ref(0);

const { data: subscription, error: subscriptionError, pending: subscriptionPending, refresh: refreshSubscription } =
  useConsoleQuery(() => $trpc.admin.subscription.query({ userId }));
const { data: content, error: contentError, pending: contentPending, refresh: refreshContent } =
  useConsoleQuery(() => $trpc.admin.userContent.query({ userId, limit: LIMIT, offset: offset.value }));

const busy = ref(false);
const actionError = ref('');

/**
 * Two loaders read one account, so every write here has to reload both — the console's own
 * `run()` only knows about the query it came from.
 */
const mutate = async (action: () => Promise<unknown>) => {
  busy.value = true;
  actionError.value = '';
  try {
    await action();
  } catch (cause: any) {
    actionError.value = cause?.message || 'Дія не вдалася.';
    return false;
  } finally {
    busy.value = false;
  }
  await Promise.all([refreshSubscription(), refreshContent()]);
  return true;
};

const reasonPrompt = (title: string, danger = false) => ask({
  title,
  label: 'Причина',
  kind: 'textarea',
  minLength: 8,
  maxLength: 500,
  danger,
  hint: 'Мінімум 8 символів. Текст і всі зміни поїдуть в журнал дій адміністратора.',
});

const statusOf = (user: { bannedAt: Date | null; shadowbannedAt: Date | null }) =>
  user.bannedAt ? 'banned' : user.shadowbannedAt ? 'shadowbanned' : 'active';

const setEntitlement = async () => {
  const profile = content.value?.profile;
  if (!profile) return;
  const plan = await ask({
    title: 'Який план видати',
    label: 'План',
    value: 'vip',
    hint: 'vip, plus або prime. Для підписки, купленої в Telegram Stars, план змінити не можна — тільки продовжити той самий.',
  });
  if (plan === null) return;
  if (!['vip', 'plus', 'prime'].includes(plan)) {
    actionError.value = 'План має бути vip, plus або prime.';
    return;
  }
  const daysAnswer = await ask({ title: 'На скільки днів', label: 'Днів', kind: 'number', value: '30', maxLength: 3, hint: 'Ціле число від 1 до 365.' });
  if (daysAnswer === null) return;
  const days = Number(daysAnswer);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    actionError.value = 'Тривалість має бути цілим числом від 1 до 365 днів.';
    return;
  }
  const reason = await reasonPrompt('Обґрунтування видачі');
  if (reason === null) return;
  await mutate(() => $trpc.admin.setEntitlement.mutate({ userId, plan: plan as 'vip' | 'plus' | 'prime', days, reason }));
};

const cancelEntitlement = async () => {
  const note = await reasonPrompt('Скасувати підписку', true);
  if (note === null) return;
  await mutate(() => $trpc.admin.cancelEntitlement.mutate({ userId, note }));
};

const grantVip = async () => {
  const profile = content.value?.profile;
  if (!profile) return;
  const daysAnswer = await ask({ title: 'Надати VIP', label: 'Тривалість, днів', kind: 'number', value: '30', maxLength: 3, hint: 'Ціле число від 1 до 365.' });
  if (daysAnswer === null) return;
  const days = Number(daysAnswer);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    actionError.value = 'Тривалість VIP має бути цілим числом від 1 до 365 днів.';
    return;
  }
  const reason = await reasonPrompt('Причина надання VIP');
  if (reason === null) return;
  await mutate(() => $trpc.admin.grantVip.mutate({ userId, days, reason }));
};

const setStatus = async (next: 'active' | 'banned' | 'shadowbanned') => {
  const profile = content.value?.profile;
  if (!profile || next === statusOf(profile)) return;
  const reason = await reasonPrompt(
    next === 'banned' ? 'Заблокувати акаунт' : next === 'shadowbanned' ? 'Тіньовий бан' : 'Повернути доступ',
    next !== 'active',
  );
  if (reason === null) return;
  await mutate(() => $trpc.admin.setUserStatus.mutate({ userId, status: next, reason }));
};

const forceLogout = async () => {
  const reason = await reasonPrompt('Завершити всі сесії', true);
  if (reason === null) return;
  await mutate(() => $trpc.admin.forceLogout.mutate({ userId, reason }));
};

const editField = async (field: 'displayName' | 'city' | 'bio') => {
  const profile = content.value?.profile;
  if (!profile) return;
  const current = profile[field] ?? '';
  const value = await ask({
    title: field === 'displayName' ? 'Змінити ім’я' : field === 'city' ? 'Змінити місто' : 'Змінити bio',
    label: 'Нове значення',
    kind: field === 'bio' ? 'textarea' : 'text',
    value: String(current),
    maxLength: field === 'bio' ? 500 : 80,
    minLength: field === 'bio' ? 0 : 2,
    hint: field === 'displayName' ? 'Від 2 до 40 символів.' : field === 'city' ? 'Від 2 до 80 символів.' : 'До 500 символів; порожнє значення прибирає bio.',
  });
  if (value === null) return;
  const reason = await reasonPrompt('Чому змінюємо профіль');
  if (reason === null) return;
  await mutate(() => $trpc.admin.updateUserProfile.mutate({ userId, patch: { [field]: value }, reason }));
};

const photos = computed(() => content.value?.photos.rows ?? []);
const entitlement = computed(() => subscription.value?.entitlement ?? null);
const isVip = computed(() => !!entitlement.value && entitlement.value.status === 'active' && entitlement.value.expiresAt > new Date());

/** Media, voice and call messages store a JSON body, which would otherwise print as a blob here. */
const bodyPreview = (message: { kind: string; body: string }) => {
  const body = message.body ?? '';
  if (!body.startsWith('{')) return body.length > 240 ? `${body.slice(0, 240)}…` : body;
  try {
    const parsed = JSON.parse(body);
    return `[${parsed.kind ?? message.kind}] ${parsed.fileName ?? ''}`.trim();
  } catch {
    return body;
  }
};

if (!userId) void router.replace('/users');
</script>

<template>
  <div class="adm__between">
    <div>
      <NuxtLink to="/users" class="adm__link">← До списку користувачів</NuxtLink>
      <h1>{{ content?.profile?.displayName || 'Користувач' }}</h1>
      <p class="adm__mono">{{ userId }}</p>
    </div>
    <div class="adm__actions" v-if="content">
      <button class="adm__btn" type="button" :disabled="busy" @click="setStatus('active')">Активний</button>
      <button class="adm__btn adm__btn--danger" type="button" :disabled="busy" @click="setStatus('banned')">Бан</button>
      <button class="adm__btn adm__btn--danger" type="button" :disabled="busy" @click="setStatus('shadowbanned')">Тінь</button>
      <button class="adm__btn adm__btn--gold" type="button" :disabled="busy" @click="grantVip">VIP</button>
      <button class="adm__btn" type="button" :disabled="busy" @click="forceLogout">Вийти скрізь</button>
    </div>
  </div>

  <p v-if="actionError" class="adm__error">{{ actionError }}</p>

  <section v-if="content" class="adm__panel">
    <h2>Профіль</h2>
    <div class="adm__grid">
      <p><span class="adm__muted">Статус:</span>
        <span class="adm__chip" :class="`adm__chip--${statusOf(content.profile) === 'active' ? 'ok' : statusOf(content.profile) === 'shadowbanned' ? 'warn' : 'banned'}`">
          {{ statusOf(content.profile) === 'active' ? 'Активний' : statusOf(content.profile) === 'shadowbanned' ? 'Тіньовий бан' : 'Бан' }}
        </span>
      </p>
      <p><span class="adm__muted">Місто:</span> {{ content.profile.city || '—' }}</p>
      <p><span class="adm__muted">Народження:</span> {{ fmtDay(content.profile.birthdate) }}</p>
      <p><span class="adm__muted">Створено:</span> {{ fmtDate(content.profile.createdAt) }}</p>
      <p><span class="adm__muted">Остання активність:</span> {{ fmtDate(content.profile.lastActiveAt) }}</p>
      <p><span class="adm__muted">Telegram:</span> {{ content.profile.telegramUsername || '—' }}</p>
      <p><span class="adm__muted">Рівень / XP:</span> {{ content.profile.level }} · {{ fmtNumber(content.profile.xp) }}</p>
      <p><span class="adm__muted">Сесій версія:</span> {{ content.profile.sessionVersion }}</p>
    </div>
    <p class="adm__note">{{ content.profile.bio || 'Bio порожнє.' }}</p>
    <div class="adm__actions">
      <button class="adm__btn" type="button" :disabled="busy" @click="editField('displayName')">Змінити ім’я</button>
      <button class="adm__btn" type="button" :disabled="busy" @click="editField('city')">Змінити місто</button>
      <button class="adm__btn" type="button" :disabled="busy" @click="editField('bio')">Змінити bio</button>
    </div>
  </section>

  <section v-if="content" class="adm__panel">
    <h2>Фото</h2>
    <p class="adm__muted">
      У профілі показується {{ (content.profile.photos ?? []).length }} з {{ fmtNumber(content.photos.total) }} активів.
    </p>
    <div v-if="photos.length" class="adm__grid adm__grid--photos">
      <figure v-for="photo in photos" :key="photo.id" class="adm__photo">
        <img :src="photo.publicUrl" :alt="photo.id" loading="lazy">
        <figcaption>
          <span class="adm__chip" :class="photo.moderationStatus === 'approved' ? 'adm__chip--ok' : photo.moderationStatus === 'pending' ? 'adm__chip--warn' : 'adm__chip--banned'">
            {{ photo.moderationStatus === 'approved' ? 'Схвалено' : photo.moderationStatus === 'pending' ? 'На перевірці' : 'Відхилено' }}
          </span>
          <span v-if="photo.moderationProvider" class="adm__mono">{{ photo.moderationProvider }} · {{ photo.moderationScore?.toFixed(2) ?? '—' }}</span>
          <span v-if="photo.moderationNote" class="adm__muted">{{ photo.moderationNote }}</span>
          <span class="adm__muted">{{ fmtDate(photo.createdAt) }}</span>
        </figcaption>
      </figure>
    </div>
    <p v-else-if="!contentPending" class="adm__muted">Фото в цього акаунта немає.</p>
    <AdminPager
      v-if="content.photos.total > LIMIT"
      :total="content.photos.total"
      :limit="LIMIT"
      :offset="offset"
      @update:offset="offset = $event; refreshContent()"
    />
  </section>

  <section class="adm__panel">
    <h2>Підписка й платежі</h2>
    <p v-if="subscriptionPending && !subscription" class="adm__muted">Оновлюємо дані…</p>
    <p v-if="subscriptionError" class="adm__error">{{ subscriptionError }}</p>

    <template v-if="subscription">
      <div class="adm__grid">
        <p><span class="adm__muted">План:</span> {{ entitlement?.plan ?? '—' }}</p>
        <p><span class="adm__muted">Статус:</span> {{ entitlement?.status ?? 'немає рядка' }}</p>
        <p><span class="adm__muted">Джерело:</span> {{ entitlement?.source ?? '—' }}</p>
        <p><span class="adm__muted">Діє до:</span> {{ entitlement ? fmtDate(entitlement.expiresAt) : '—' }}</p>
        <p><span class="adm__muted">Скасовано:</span> {{ entitlement?.cancelledAt ? fmtDate(entitlement.cancelledAt) : '—' }}</p>
        <p><span class="adm__muted">Charge:</span> <span class="adm__mono">{{ entitlement?.telegramSubscriptionChargeId || '—' }}</span></p>
      </div>
      <div class="adm__actions">
        <button class="adm__btn adm__btn--gold" type="button" :disabled="busy" @click="setEntitlement">
          {{ entitlement ? 'Продовжити / змінити план' : 'Видати план' }}
        </button>
        <button
          class="adm__btn adm__btn--danger"
          type="button"
          :disabled="busy || !entitlement || entitlement.status === 'cancelled' || entitlement.source === 'stars'"
          :title="entitlement?.source === 'stars' ? 'Підписку Stars скасовують через charge в Telegram' : ''"
          @click="cancelEntitlement"
        >
          Скасувати підписку
        </button>
      </div>
      <p v-if="isVip" class="adm__hint">Акаунт зараз із платним планом.</p>

      <h3>Платежі</h3>
      <table v-if="subscription.intents.length" class="adm__table">
        <thead>
          <tr><th>Створено</th><th>SKU</th><th>План</th><th>Статус</th><th class="adm__nowrap">Сума</th></tr>
        </thead>
        <tbody>
          <tr v-for="intent in subscription.intents" :key="intent.id">
            <td class="adm__nowrap">{{ fmtDate(intent.createdAt) }}</td>
            <td>{{ intent.sku }}</td>
            <td>{{ intent.plan || '—' }}</td>
            <td>{{ intent.status }}</td>
            <td class="adm__nowrap">{{ fmtNumber(intent.totalAmount) }} {{ intent.currency }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="adm__muted">Платежних інтентів немає.</p>

      <table v-if="subscription.charges.length" class="adm__table">
        <thead>
          <tr><th>Списано</th><th class="adm__nowrap">Stars</th><th>Періодичний</th><th>Charge</th></tr>
        </thead>
        <tbody>
          <tr v-for="charge in subscription.charges" :key="charge.id">
            <td class="adm__nowrap">{{ fmtDate(charge.paidAt) }}</td>
            <td class="adm__nowrap">{{ fmtNumber(charge.stars) }} {{ charge.currency }}</td>
            <td>{{ charge.recurring ? 'так' : 'ні' }}</td>
            <td class="adm__mono">{{ charge.chargeId }}</td>
          </tr>
        </tbody>
      </table>

      <h3>Бусты й подарунки</h3>
      <p class="adm__muted">
        Бустів: {{ subscription.boosts.length }}{{ subscription.boosts.length ? ` · найпізніший до ${fmtDate(subscription.boosts[0].expiresAt)}` : '' }}.
        Подарунків відправлено {{ fmtNumber(subscription.gifts.sentCount) }} ({{ fmtNumber(subscription.gifts.starsSent) }} stars),
        отримано {{ fmtNumber(subscription.gifts.receivedCount) }}.
      </p>
      <ul v-if="subscription.gifts.sent.length || subscription.gifts.received.length" class="adm__stack">
        <li v-for="gift in subscription.gifts.sent" :key="`sent-${gift.id}`">
          <span class="adm__chip adm__chip--draft">відправлено</span> {{ gift.sku }} · {{ fmtNumber(gift.stars) }} stars · {{ gift.partner || '—' }} · {{ fmtDate(gift.createdAt) }}
        </li>
        <li v-for="gift in subscription.gifts.received" :key="`got-${gift.id}`">
          <span class="adm__chip adm__chip--published">отримано</span> {{ gift.sku }} · {{ fmtNumber(gift.stars) }} stars · {{ gift.partner || '—' }} · {{ fmtDate(gift.createdAt) }}
        </li>
      </ul>
    </template>
  </section>

  <section v-if="content" class="adm__panel">
    <h2>Активність і скарги</h2>
    <p class="adm__muted">
      Матчів {{ fmtNumber(content.activity.matches) }} · повідомлень написано {{ fmtNumber(content.activity.sent) }} ·
      отримано {{ fmtNumber(content.activity.received) }}.
    </p>

    <h3>Останні власні повідомлення</h3>
    <p class="adm__hint">Тексти приватного листування — це PII: видно лише 10 останніх, і лише в цьому екрані.</p>
    <ul v-if="content.activity.recent.length" class="adm__stack">
      <li v-for="message in content.activity.recent" :key="message.id">
        <span class="adm__mono">{{ fmtDate(message.createdAt) }}</span>
        <span class="adm__muted">{{ message.kind }}</span>
        <div class="adm__note">{{ bodyPreview(message) }}</div>
      </li>
    </ul>
    <p v-else class="adm__muted">Повідомлень немає.</p>

    <h3>Скарги на цей акаунт</h3>
    <table v-if="content.reports.against.length" class="adm__table">
      <thead><tr><th>Дата</th><th>Причина</th><th>Статус</th><th>Хто скаржився</th></tr></thead>
      <tbody>
        <tr v-for="report in content.reports.against" :key="report.id">
          <td class="adm__nowrap">{{ fmtDate(report.createdAt) }}</td>
          <td>{{ report.reason }}</td>
          <td>{{ report.status }}</td>
          <td>{{ report.reporterName || '—' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else class="adm__muted">Скарг на цей акаунт немає.</p>

    <h3>Звернення в підтримку</h3>
    <ul v-if="content.tickets.length" class="adm__stack">
      <li v-for="ticket in content.tickets" :key="ticket.id">
        <span class="adm__chip" :class="ticket.status === 'open' ? 'adm__chip--warn' : 'adm__chip--archived'">{{ ticket.status }}</span>
        {{ ticket.subject }} · {{ fmtDate(ticket.updatedAt) }}
        <NuxtLink :to="`/support?ticket=${ticket.id}`" class="adm__link">відкрити гілку</NuxtLink>
      </li>
    </ul>
    <p v-else class="adm__muted">Звернень немає.</p>
  </section>
</template>

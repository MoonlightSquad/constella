<script setup lang="ts">
const { $trpc } = useNuxtApp();
const { ask } = useAdminPrompt();

const WINDOWS = [7, 30, 90];
const days = ref(30);

const { data: metrics, error, pending, refresh } = useConsoleQuery(() =>
  $trpc.admin.metrics.query({ days: days.value }),
);

const SERIES = [
  { key: 'signups', label: 'Реєстрації' },
  { key: 'lastActive', label: 'Активні за день' },
  { key: 'matches', label: 'Матчі' },
  { key: 'messages', label: 'Повідомлення' },
  { key: 'photos', label: 'Завантажені фото' },
  { key: 'rejectedPhotos', label: 'Відхилені фото' },
] as const;

const charts = computed(() => {
  const series = metrics.value?.series;
  if (!series) return [];
  return SERIES.map((item) => {
    const points = series[item.key];
    const peak = points.reduce((max, point) => Math.max(max, point.count), 0);
    return {
      key: item.key,
      label: item.label,
      peak,
      total: points.reduce((sum, point) => sum + point.count, 0),
      bars: points.map((point, index) => ({
        day: point.day,
        count: point.count,
        size: peak ? Math.round((point.count / peak) * 100) : 0,
        isLast: index === points.length - 1,
      })),
    };
  });
});

const funnel = computed(() => {
  const steps = metrics.value?.funnel ?? [];
  const base = Math.max(1, steps[0]?.value ?? 1);
  return steps.map((step, index) => ({
    label: step.label,
    value: step.value,
    share: Math.round((step.value / base) * 100),
    lost: index === 0 ? 0 : (steps[index - 1]?.value ?? 0) - step.value,
  }));
});

const AUDIENCES = [
  { value: 'active', label: 'Активні' },
  { value: 'new', label: 'Нові' },
  { value: 'vip', label: 'VIP' },
  { value: 'all', label: 'Усі без бану' },
] as const;

const audience = ref<'all' | 'active' | 'new' | 'vip'>('active');
const audienceDays = ref(7);

// Окремий запит, бо аудиторію перемикають значно частіше, ніж усе решту сторінки.
const { data: reach, error: reachError, pending: reachPending, refresh: refreshReach } = useConsoleQuery(() =>
  $trpc.admin.pushRecipients.query({ audience: audience.value, days: audienceDays.value }),
);

const form = reactive({ title: '', body: '', reason: '', dryRun: true });
const sending = ref(false);
const sendError = ref('');
const result = ref<string | null>(null);

const titleLength = computed(() => form.title.trim().length);
const bodyLength = computed(() => form.body.trim().length);

const overCap = computed(() => Boolean(reach.value?.truncated));
const readyToSend = computed(() =>
  !sending.value
  && !overCap.value
  && titleLength.value >= 3
  && bodyLength.value >= 3
  && (form.dryRun || form.reason.trim().length >= 8),
);

// Розсилку не відкликати, тому справжній надсилати можна лише переконавшись у підписі.
const confirmSend = async () => {
  const answer = await ask({
    title: 'Жива розсилка',
    label: `Надіслати «${form.title.trim()}» на ${reach.value?.sendable ?? 0} пристроїв?`,
    kind: 'text',
    maxLength: 8,
    danger: true,
    hint: 'Введи SEND. Пуш, який дійшов до пристрою, не забрати — і повторний клік надішлюще ще раз.',
  });
  return answer !== null && answer.trim() === 'SEND';
};

const submit = async () => {
  sendError.value = '';
  result.value = null;
  if (!form.dryRun && !(await confirmSend())) return;

  sending.value = true;
  try {
    const sent = await $trpc.admin.pushBroadcast.mutate({
      audience: audience.value,
      days: audienceDays.value,
      title: form.title.trim(),
      body: form.body.trim(),
      reason: form.reason.trim(),
      dryRun: form.dryRun,
    });
    result.value = sent.dryRun
      ? `Превʼю: ${sent.recipients} пристроїв отримали б повідомлення, ${sent.quiet} — у тихій годині, ${sent.malformed} із протухлим токеном.`
      : `Expo прийняв ${sent.accepted} із ${sent.recipients}; відсіяно ${sent.dropped}. Тиха година: ${sent.quiet}. Дія записана в журнал.`;
    if (!sent.dryRun) await refreshReach();
  } catch (cause: any) {
    sendError.value = cause?.message || 'Розсилка не вдалася.';
  } finally {
    sending.value = false;
  }
};
</script>

<template>
  <div class="adm__between">
    <h1>Ріст</h1>
    <div class="adm__row">
      <select v-model.number="days" class="adm__select" @change="refresh()">
        <option v-for="window in WINDOWS" :key="window" :value="window">Останні {{ window }} днів</option>
      </select>
      <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
    </div>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !metrics" class="adm__muted">Збираємо агрегати…</p>

  <template v-if="metrics">
    <div class="adm__grid adm__grid--cards">
      <article class="adm__card">
        <span>Акаунтів усього</span>
        <strong>{{ fmtNumber(metrics.accounts.total) }}</strong>
        <small>з баном: {{ fmtNumber(metrics.accounts.banned) }} · із тіні: {{ fmtNumber(metrics.accounts.shadowbanned) }}</small>
      </article>
      <article class="adm__card">
        <span>Матчів</span>
        <strong>{{ fmtNumber(metrics.activity.matches) }}</strong>
        <small>Повідомлень: {{ fmtNumber(metrics.activity.messages) }} · прочитаних: {{ fmtNumber(metrics.activity.read) }}</small>
      </article>
      <article class="adm__card">
        <span>Чинні підписки</span>
        <strong>{{ fmtNumber(metrics.plans.active) }}</strong>
        <small>Tokens: {{ fmtNumber(metrics.money.stars) }} · платників: {{ fmtNumber(metrics.money.payers) }}</small>
      </article>
      <article class="adm__card">
        <span>Черга фото</span>
        <strong>{{ fmtNumber(metrics.moderation.pending) }}</strong>
        <small>Затверджено: {{ fmtNumber(metrics.moderation.approved) }} · відхилено: {{ fmtNumber(metrics.moderation.rejected) }}</small>
      </article>
      <article class="adm__card">
        <span>Відкриті скарги</span>
        <strong>{{ fmtNumber(metrics.reports.open) }}</strong>
        <small>Підтримка: {{ fmtNumber(metrics.support.open) }} тікетів · закрито {{ fmtNumber(metrics.support.closed) }}</small>
      </article>
      <article class="adm__card">
        <span>Push-пристрої</span>
        <strong>{{ fmtNumber(metrics.push.tokens) }}</strong>
        <small>у людей: {{ fmtNumber(metrics.push.people) }}</small>
      </article>
    </div>

    <section class="adm__panel">
      <h2>Воронка онбордингу</h2>
      <div v-for="step in funnel" :key="step.label" class="adm__meter">
        <div class="adm__label">
          <span>{{ step.label }}</span>
          <span class="adm__count">{{ fmtNumber(step.value) }} · {{ step.share }}%</span>
        </div>
        <div class="adm__meter__bar"><i :style="{ width: step.share + '%' }" /></div>
        <span v-if="step.lost > 0" class="adm__hint">Втрачено на кроці: {{ fmtNumber(step.lost) }}</span>
      </div>
    </section>

    <section v-for="chart in charts" :key="chart.key" class="adm__panel">
      <div class="adm__between">
        <h2>{{ chart.label }}</h2>
        <span class="adm__muted">за вікно: {{ fmtNumber(chart.total) }} · пік за день: {{ fmtNumber(chart.peak) }}</span>
      </div>
      <div class="adm__spark">
        <span
          v-for="bar in chart.bars"
          :key="bar.day"
          class="adm__spark__bar"
          :class="{ 'adm__spark__bar--last': bar.isLast }"
          :style="{ height: bar.size + '%' }"
          :title="`${bar.day}: ${bar.count}`"
        />
      </div>
    </section>

    <section class="adm__panel">
      <h2>Модерація фото</h2>
      <div class="adm__row">
        <span class="adm__chip">Усього: {{ fmtNumber(metrics.moderation.total) }}</span>
        <span class="adm__chip adm__chip--warn">Оцінені AI: {{ fmtNumber(metrics.moderation.scored) }}</span>
        <span v-for="provider in metrics.providers" :key="provider.provider" class="adm__chip">
          {{ provider.provider }}: {{ fmtNumber(provider.count) }}
        </span>
      </div>
      <p class="adm__hint">Підписки: активні {{ fmtNumber(metrics.plans.active) }} · зі stars {{ fmtNumber(metrics.plans.fromStars) }} · від адміна {{ fmtNumber(metrics.plans.fromAdmin) }} · скасовані {{ fmtNumber(metrics.plans.cancelled) }}</p>
    </section>
  </template>

  <section class="adm__panel">
    <div class="adm__between">
      <h2>Push-розсилка</h2>
      <button class="adm__btn" type="button" :disabled="reachPending" @click="refreshReach">Рахувати аудиторію</button>
    </div>

    <div class="adm__filters">
      <select v-model="audience" class="adm__select" @change="refreshReach()">
        <option v-for="item in AUDIENCES" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <select v-model.number="audienceDays" class="adm__select" :disabled="audience === 'all' || audience === 'vip'" @change="refreshReach()">
        <option v-for="window in [1, 3, 7, 14, 30, 90]" :key="window" :value="window">за {{ window }} дн.</option>
      </select>
    </div>

    <p v-if="reachError" class="adm__error">{{ reachError }}</p>
    <div v-if="reach" class="adm__row">
      <span class="adm__chip">{{ fmtNumber(reach.people) }} людей</span>
      <span class="adm__chip">{{ fmtNumber(reach.devices) }} пристроїв</span>
      <span class="adm__chip adm__chip--ok">дійсні токени: {{ fmtNumber(reach.sendable) }}</span>
      <span class="adm__chip adm__chip--warn">у тихій годині: {{ fmtNumber(reach.quiet) }}</span>
      <span v-if="reach.malformed" class="adm__chip adm__chip--banned">протухлих: {{ fmtNumber(reach.malformed) }}</span>
      <span class="adm__chip">ліміт на виклик: {{ fmtNumber(reach.cap) }}</span>
    </div>
    <p v-if="overCap" class="adm__error">
      Аудиторія перевищує {{ fmtNumber(reach?.cap) }} адресатів — звузьте фільтр: один виклик функції не тримає розсилку на всю базу.
    </p>
    <p class="adm__hint">
      Тиху годину (23:00–08:00 за поясом користувача) рахуємо так само, як і при звичайному пуші:
      «тихі» адресати дійдуть без звуку, а не не прийдуть.
    </p>

    <div class="adm__field">
      <label class="adm__label" for="push-title">
        <span>Заголовок</span>
        <span class="adm__count">{{ titleLength }}/48</span>
      </label>
      <input id="push-title" v-model="form.title" class="adm__input" type="text" maxlength="48" placeholder="Constella">
    </div>

    <div class="adm__field">
      <label class="adm__label" for="push-body">
        <span>Текст</span>
        <span class="adm__count">{{ bodyLength }}/240</span>
      </label>
      <textarea id="push-body" v-model="form.body" class="adm__area adm__area--tall" maxlength="240" placeholder="Що нового — одночасно для всіх обраних." />
    </div>

    <label class="adm__row" style="gap: 8px">
      <input id="push-dry-run" v-model="form.dryRun" type="checkbox">
      <span class="adm__muted">Превʼю без відправки — порахувати адресатів і зупинитися перед Expo</span>
    </label>

    <div class="adm__field" style="margin-top: 14px">
      <label class="adm__label" for="push-reason">
        <span>Причина для журналу дій</span>
        <span class="adm__count">мінімум 8 символів</span>
      </label>
      <textarea
        id="push-reason"
        v-model="form.reason"
        class="adm__area"
        maxlength="500"
        :required="!form.dryRun"
        :placeholder="form.dryRun ? 'Необовʼязково, доки це превʼю' : 'Навіщо ця розсилка — піде в admin_audit_logs'"
      />
    </div>

    <p v-if="sendError" class="adm__error">{{ sendError }}</p>
    <p v-else-if="result" class="adm__note">{{ result }}</p>

    <div class="adm__row" style="margin-top: 14px">
      <button
        class="adm__btn"
        :class="form.dryRun ? 'adm__btn--gold' : 'adm__btn--danger'"
        type="button"
        :disabled="!readyToSend"
        @click="submit"
      >
        {{ sending ? '…' : form.dryRun ? 'Перевірити без відправки' : 'Надіслати просто зараз' }}
      </button>
      <span v-if="!form.dryRun && titleLength < 3" class="adm__hint">Короткий заголовок — від 3 символів.</span>
      <span v-else-if="!form.dryRun && form.reason.trim().length < 8" class="adm__hint">Справжня розсилка потребує причини.</span>
    </div>
  </section>
</template>

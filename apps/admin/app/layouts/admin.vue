<script setup lang="ts">
const { session, signOut } = useAdminSession();
const route = useRoute();
const busy = ref(false);

type Section = { to: string; label: string; hint: string; exact?: boolean };
type Group = { title: string; items: Section[] };

const groups: Group[] = [
  { title: 'Огляд', items: [{ to: '/', label: 'Огляд', hint: 'Зведення за сьогодні', exact: true }] },
  {
    title: 'Люди й модерація',
    items: [
      { to: '/users', label: 'Користувачі', hint: 'Профілі, бани, VIP' },
      { to: '/reports', label: 'Скарги', hint: 'Черга скарг на контент' },
      { to: '/photos', label: 'Фото', hint: 'Модерація фотоальбомів' },
      { to: '/support', label: 'Підтримка', hint: 'Звернення користувачів' },
    ],
  },
  {
    title: 'Гроші й ріст',
    items: [
      { to: '/payments', label: 'Платежі', hint: 'Підписки та історія оплат' },
      { to: '/growth', label: 'Ріст', hint: 'Метрики й динаміка' },
    ],
  },
  { title: 'Контент', items: [{ to: '/blog', label: 'Блог', hint: 'Статті та переклади' }] },
  {
    title: 'Система',
    items: [
      { to: '/admins', label: 'Адміністратори', hint: 'Доступи до консолі' },
      { to: '/audit', label: 'Журнал дій', hint: 'Історія дій адміністраторів' },
    ],
  },
];

const isOn = (section: Section) =>
  section.exact ? route.path === '/' : route.path === section.to || route.path.startsWith(`${section.to}/`);

const allSections = groups.flatMap((group) => group.items);
const current = computed(() => allSections.find(isOn));

const open = ref(false);
const bar = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const barHeight = ref(0);
let resize: ResizeObserver | undefined;

const closeMenu = (refocus = false) => {
  if (!open.value) return;
  open.value = false;
  if (refocus) void nextTick(() => trigger.value?.focus());
};

const toggleMenu = () => {
  open.value = !open.value;
};

watch(open, async (isOpen) => {
  if (!isOpen) return;
  await nextTick();
  panel.value?.querySelector<HTMLElement>('a[aria-current="page"], a')?.focus();
});

watch(() => route.fullPath, () => closeMenu());

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeMenu(true);
};

onMounted(() => {
  resize = new ResizeObserver(() => {
    barHeight.value = bar.value?.offsetHeight ?? 0;
  });
  if (bar.value) {
    resize.observe(bar.value);
    barHeight.value = bar.value.offsetHeight;
  }
  window.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  resize?.disconnect();
  window.removeEventListener('keydown', onKey);
});

const logout = async () => {
  busy.value = true;
  try {
    await signOut();
    await navigateTo('/login');
  } finally {
    busy.value = false;
  }
};

useSeoMeta({ robots: 'noindex, nofollow', title: () => `Constella admin — ${route.path}` });
</script>

<template>
  <div class="adm" :style="{ '--adm-bar-h': `${barHeight}px` }">
    <a class="skip-link" href="#adm-main">Перейти до вмісту</a>

    <header ref="bar" class="adm__bar">
      <NuxtLink class="adm__brand" to="/" @click="closeMenu()">
        <BrandMark :size="26" />
        <span>Constella <em>admin</em></span>
      </NuxtLink>

      <button
        ref="trigger"
        class="adm__menu"
        type="button"
        :aria-expanded="open"
        aria-controls="adm-sections"
        @click="toggleMenu"
      >
        <span>Розділи</span>
        <span v-if="current" class="adm__menu__now">{{ current.label }}</span>
        <span class="adm__menu__chev" aria-hidden="true">▾</span>
      </button>

      <div class="adm__user">
        <span class="adm__email">{{ session?.email ?? '—' }}</span>
        <button class="adm__btn" type="button" :disabled="busy" @click="logout">{{ busy ? '…' : 'Вийти' }}</button>
      </div>
    </header>

    <Transition name="adm-veil">
      <div v-if="open" class="adm__veil" @click="closeMenu(true)" />
    </Transition>

    <Transition name="adm-mega">
      <nav v-if="open" id="adm-sections" ref="panel" class="adm__mega" aria-label="Усі розділи">
        <div class="adm__mega__inner">
          <section v-for="group in groups" :key="group.title" class="adm__mega__group">
            <h2 class="adm__mega__title">{{ group.title }}</h2>
            <NuxtLink
              v-for="section in group.items"
              :key="section.to"
              :to="section.to"
              class="adm__mega__link"
              :class="{ 'adm__mega__link--on': isOn(section) }"
              :aria-current="isOn(section) ? 'page' : undefined"
              @click="closeMenu()"
            >
              <strong>{{ section.label }}</strong>
              <small>{{ section.hint }}</small>
            </NuxtLink>
          </section>
        </div>
      </nav>
    </Transition>

    <main id="adm-main" class="adm__main" tabindex="-1" :inert="open ? '' : undefined">
      <slot />
    </main>

    <AdminPromptDialog />
  </div>
</template>

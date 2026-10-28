<script setup lang="ts">
const { session, signOut } = useAdminSession();
const route = useRoute();
const busy = ref(false);

const tabs = [
  { to: '/', label: 'Огляд', exact: true },
  { to: '/users', label: 'Користувачі' },
  { to: '/reports', label: 'Скарги' },
  { to: '/photos', label: 'Фото' },
  { to: '/payments', label: 'Платежі' },
  { to: '/support', label: 'Підтримка' },
  { to: '/growth', label: 'Ріст' },
  { to: '/blog', label: 'Блог' },
  { to: '/admins', label: 'Адміністратори' },
  { to: '/audit', label: 'Журнал дій' },
];

const isOn = (tab: { to: string; exact?: boolean }) =>
  tab.exact ? route.path === '/' : route.path === tab.to || route.path.startsWith(`${tab.to}/`);

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
  <div class="adm">
    <header class="adm__bar">
      <NuxtLink class="adm__brand" to="/">
        <BrandMark :size="26" />
        <span>Constella <em>admin</em></span>
      </NuxtLink>

      <nav class="adm__nav" aria-label="Розділи">
        <NuxtLink v-for="tab in tabs" :key="tab.to" :to="tab.to" class="adm__tab" :class="{ 'adm__tab--on': isOn(tab) }">{{ tab.label }}</NuxtLink>
      </nav>

      <div class="adm__user">
        <span class="adm__email">{{ session?.email ?? '—' }}</span>
        <button class="adm__btn" type="button" :disabled="busy" @click="logout">{{ busy ? '…' : 'Вийти' }}</button>
      </div>
    </header>

    <main class="adm__main">
      <slot />
    </main>

    <AdminPromptDialog />
  </div>
</template>

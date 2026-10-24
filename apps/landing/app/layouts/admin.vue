<script setup lang="ts">
const { session, signOut } = useAdminSession();
const route = useRoute();
const busy = ref(false);

const logout = async () => {
  busy.value = true;
  try {
    await signOut();
    await navigateTo('/admin/login');
  } finally {
    busy.value = false;
  }
};

useSeoMeta({ robots: 'noindex, nofollow', title: () => `Constella admin — ${route.path}` });
</script>

<template>
  <div class="adm">
    <header class="adm__bar">
      <NuxtLink class="adm__brand" to="/admin">
        <BrandMark :size="26" />
        <span>Constella <em>admin</em></span>
      </NuxtLink>

      <nav class="adm__nav" aria-label="Адмінка">
        <NuxtLink to="/admin" class="adm__tab" :class="{ 'adm__tab--on': route.path === '/admin' }">Пости</NuxtLink>
        <NuxtLink to="/admin/posts/new" class="adm__tab" :class="{ 'adm__tab--on': route.path === '/admin/posts/new' }">Новий</NuxtLink>
      </nav>

      <div class="adm__user">
        <span class="adm__email">{{ session?.email ?? '—' }}</span>
        <NuxtLink class="adm__link" to="/" target="_blank">Сайт ↗</NuxtLink>
        <button class="adm__btn" type="button" :disabled="busy" @click="logout">{{ busy ? '…' : 'Вийти' }}</button>
      </div>
    </header>

    <main class="adm__main">
      <slot />
    </main>
  </div>
</template>

<style>
@import '../assets/css/admin.css';
</style>

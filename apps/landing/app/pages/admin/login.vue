<script setup lang="ts">
// `i18n: false` keeps the console out of locale routing: /admin/uk/login would be a
// second copy of the same page for crawlers and for the language switcher.
definePageMeta({ layout: 'blank', i18n: false });

const { signIn } = useAdminSession();
const route = useRoute();
const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

const submit = async () => {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await signIn(email.value.trim(), password.value);
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/admin') ? route.query.next : '/admin';
    await navigateTo(next);
  } catch (cause) {
    error.value = (cause as Error).message;
    password.value = '';
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <form class="adm__login" autocomplete="on" @submit.prevent="submit">
    <h1>Constella admin</h1>
    <p class="adm__muted">Блог лендінгу: пости, переклади, публікація.</p>

    <label class="adm__field">
      <span class="adm__label">Email</span>
      <input v-model="email" class="adm__input" type="email" name="username" autocomplete="username" required :disabled="busy">
    </label>

    <label class="adm__field">
      <span class="adm__label">Пароль</span>
      <input v-model="password" class="adm__input" type="password" name="password" autocomplete="current-password" required :disabled="busy">
    </label>

    <p v-if="error" class="adm__error" role="alert">{{ error }}</p>

    <button class="adm__btn adm__btn--gold" type="submit" :disabled="busy || !email || !password">
      {{ busy ? 'Увійди…' : 'Увійти' }}
    </button>
    <p class="adm__hint">
      Сесія тримається 8 годин і живе в httpOnly-cookie шляху <code>/api/admin</code> — бандл її не бачить.
    </p>
  </form>
</template>

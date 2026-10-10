<script setup lang="ts">
const props = defineProps<{
  busy?: boolean
  error?: string
}>()

const emit = defineEmits<{
  submit: [credentials: { email: string; password: string }]
  exit: []
}>()

const email = ref('')
const password = ref('')

const submit = () => {
  emit('submit', { email: email.value.trim(), password: password.value })
}
</script>

<template>
  <main class="admin-auth">
    <header>
      <a class="brand" href="/"><span>✦</span> constella</a>
      <button class="back" type="button" @click="emit('exit')">← До продукту</button>
    </header>
    <form class="panel" @submit.prevent="submit">
      <p class="eyebrow">ADMINISTRATION</p>
      <h1>Вхід до адмінки</h1>
      <p class="description">Увійдіть за обліковими даними адміністратора.</p>
      <label>
        <span>Пошта</span>
        <input v-model="email" type="email" autocomplete="username" maxlength="254" required>
      </label>
      <label>
        <span>Пароль</span>
        <input v-model="password" type="password" autocomplete="current-password" maxlength="1024" required>
      </label>
      <p v-if="props.error" class="error" role="alert">{{ props.error }}</p>
      <button class="submit" type="submit" :disabled="props.busy">
        {{ props.busy ? 'Перевіряємо…' : 'Увійти' }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.admin-auth{min-height:100svh;padding:20px;background:radial-gradient(ellipse at 50% 0%,#1b3631 0%,#0d1718 56%);color:#f3f5f2;font:14px Manrope,system-ui,sans-serif}
header{display:flex;width:min(100%,960px);height:44px;align-items:center;justify-content:space-between;margin:auto}
.brand{color:#f3f5f2;font-size:17px;font-weight:800;text-decoration:none}.brand span{color:#e4b46c;font-size:22px}
.back{border:1px solid #344547;border-radius:9px;padding:9px 13px;background:#172325;color:#edf2ed;cursor:pointer}
.panel{display:grid;width:min(100%,420px);gap:16px;margin:clamp(48px,12vh,110px) auto 0;border:1px solid #314343;border-radius:12px;padding:clamp(22px,6vw,34px);background:#132122ee;box-shadow:0 28px 90px #0003}
.eyebrow{margin:0;color:#85c9b9;font-size:10px;font-weight:750;letter-spacing:.14em}
h1{margin:0;font-size:28px}.description{margin:-8px 0 4px;color:#aab9b6;font-size:13px;line-height:1.5}
label{display:grid;gap:7px;color:#d4dfdc;font-size:12px}
input{width:100%;min-height:44px;border:1px solid #344748;border-radius:7px;padding:10px 12px;background:#0d1718;color:#f5f7f6;outline:none}
input:focus{border-color:#82c7b7;box-shadow:0 0 0 2px #82c7b722}
.error{margin:0;color:#ff9c8f;font-size:12px;line-height:1.5}
.submit{min-height:46px;border:0;border-radius:8px;background:#d9ad6d;color:#18211e;font-weight:750;cursor:pointer}
.submit:disabled{cursor:wait;opacity:.6}
</style>

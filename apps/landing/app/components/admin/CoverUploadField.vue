<script setup lang="ts">
import type { CoverConfirmation, CoverTicket, PostDraft } from '~/types/admin';

const props = defineProps<{ draft: PostDraft }>();

const api = useAdminApi();
const over = ref(false);
const busy = ref(false);
const error = ref('');

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

const upload = async (file: File | undefined) => {
  error.value = '';
  if (!file) return;
  if (!ALLOWED.includes(file.type)) {
    error.value = 'Тільки JPEG, PNG або WebP.';
    return;
  }
  if (file.size > MAX_BYTES) {
    error.value = `Файл ${Math.round(file.size / 1024 / 1024)} МБ — ліміт 10 МБ.`;
    return;
  }

  busy.value = true;
  try {
    const ticket = await api.post<CoverTicket>('/api/admin/covers', { contentType: file.type });
    // The PUT goes straight to object storage: the signed URL never passes through nitro
    // state, and the presign itself was produced server-side from the session cookie.
    const pushed = await fetch(ticket.uploadUrl, { method: 'PUT', headers: { 'content-type': ticket.contentType }, body: file });
    if (!pushed.ok) throw new Error(`Сховище відповіло ${pushed.status}. Перевір CORS для цього origin.`);
    const confirmed = await api.post<CoverConfirmation>('/api/admin/covers/confirm', { objectKey: ticket.objectKey, contentType: ticket.contentType });
    props.draft.coverUrl = confirmed.publicUrl;
  } catch (cause) {
    error.value = (cause as Error).message || 'Завантаження не вдалося.';
  } finally {
    busy.value = false;
  }
};

const clear = () => {
  props.draft.coverUrl = '';
  props.draft.coverAlt = '';
};
</script>

<template>
  <div>
    <div
      v-if="!draft.coverUrl"
      class="adm__drop"
      :class="{ 'adm__drop--over': over }"
      role="button"
      tabindex="0"
      @click="($refs.input as HTMLInputElement)?.click()"
      @keydown.enter="($refs.input as HTMLInputElement)?.click()"
      @dragover.prevent="over = true"
      @dragleave.prevent="over = false"
      @drop.prevent="over = false; upload($event.dataTransfer?.files[0])"
    >
      <strong>{{ busy ? 'Завантажую…' : 'Обкладинка' }}</strong>
      <span>перетягни файл сюди або клікни · JPEG/PNG/WebP · 1200×630 після нормалізації</span>
      <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="upload(($event.target as HTMLInputElement).files?.[0])">
    </div>

    <div v-else class="adm__cover">
      <img :src="draft.coverUrl" :alt="draft.coverAlt || 'Обкладинка'" loading="lazy">
      <button class="adm__cover__x" type="button" @click="clear">× Прибрати</button>
    </div>

    <div class="adm__field" style="margin-top: 12px">
      <label class="adm__label" for="cover-alt">
        Alt-текст
        <span class="adm__count" :class="{ 'adm__count--over': draft.coverUrl && !draft.coverAlt.trim() }">
          {{ draft.coverUrl ? (draft.coverAlt.length ? 'ок' : 'обовʼязковий') : 'не потрібен' }}
        </span>
      </label>
      <input id="cover-alt" v-model="draft.coverAlt" class="adm__input" type="text" maxlength="200" placeholder="Що на зображенні — це читають скрінридери й Google">
    </div>

    <div class="adm__field">
      <label class="adm__label" for="cover-url">…або вставити URL</label>
      <input id="cover-url" v-model="draft.coverUrl" class="adm__input" type="url" placeholder="https://…">
    </div>

    <p v-if="error" class="adm__error">{{ error }}</p>
    <p v-else class="adm__hint">
      Сховище не налаштоване? Тоді просто встав готовий URL — пост це не блокує.
    </p>
  </div>
</template>

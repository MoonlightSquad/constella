<script setup lang="ts">
const { $trpc } = useNuxtApp();
const { ask } = useAdminPrompt();

const LIMIT = 24;

const status = ref<'pending' | 'approved' | 'rejected'>('pending');
const offset = ref(0);

const { data: page, error, pending, refresh, run } = useConsoleQuery(() =>
  $trpc.admin.photoQueue.query({ status: status.value, limit: LIMIT, offset: offset.value }),
);

const photos = computed(() => page.value?.rows ?? []);

const decide = async (photo: any, next: 'approved' | 'rejected') => {
  const reason = await ask({
    title: next === 'approved' ? 'Схвалити фото' : 'Відхилити фото',
    label: 'Причина рішення',
    kind: 'textarea',
    minLength: 4,
    maxLength: 500,
    danger: next === 'rejected',
    hint: next === 'rejected'
      ? 'Відхилене фото видаляється зі сховища, тож причину варто сформулювати чітко.'
      : 'Мінімум 4 символи. Причина попаде в журнал дій.',
  });
  if (reason === null) return;
  await run(() => $trpc.admin.reviewPhoto.mutate({ photoId: photo.id, status: next, reason }));
};
</script>

<template>
  <div class="adm__between">
    <h1>Фото на модерації</h1>
    <button class="adm__btn" type="button" :disabled="pending" @click="refresh">Оновити</button>
  </div>

  <div class="adm__filters">
    <select v-model="status" class="adm__select" @change="offset = 0; refresh()">
      <option value="pending">На перевірці</option>
      <option value="approved">Схвалені</option>
      <option value="rejected">Відхилені</option>
    </select>
  </div>

  <p v-if="error" class="adm__error">{{ error }}</p>
  <p v-if="pending && !page" class="adm__muted">Оновлюємо дані…</p>

  <section class="adm__panel">
    <div v-if="photos.length" class="adm__grid adm__grid--photos">
      <article v-for="photo in photos" :key="photo.id" class="adm__photo">
        <img :src="photo.publicUrl" :alt="`Фото профілю ${photo.displayName || photo.userId}`" loading="lazy">
        <strong>{{ photo.displayName || 'Без імені' }}</strong>
        <span class="adm__mono">{{ photo.userId }}</span>
        <small class="adm__muted">{{ photo.width }} × {{ photo.height }} · {{ fmtDate(photo.createdAt) }}</small>
        <small class="adm__muted">
          Автомодерація: {{ photo.moderationProvider || 'невідомо' }} · оцінка {{ photo.moderationScore ?? '—' }}
        </small>
        <small v-if="photo.moderationNote" class="adm__hint">
          {{ fmtDate(photo.moderatedAt) }}: {{ photo.moderationNote }}
        </small>
        <div class="adm__actions">
          <button class="adm__btn" type="button" :disabled="photo.moderationStatus === 'approved'" @click="decide(photo, 'approved')">Схвалити</button>
          <button class="adm__btn adm__btn--danger" type="button" :disabled="photo.moderationStatus === 'rejected'" @click="decide(photo, 'rejected')">Відхилити</button>
        </div>
      </article>
    </div>
    <p v-else-if="!pending" class="adm__muted">Фото в цьому стані немає.</p>

    <AdminPager
      v-if="page?.total"
      :total="page.total"
      :limit="LIMIT"
      :offset="offset"
      @update:offset="offset = $event; refresh()"
    />
  </section>
</template>

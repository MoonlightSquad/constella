<script setup lang="ts">
import type { AdminPostDetail, AdminSibling, BlogStatus } from '~/types/admin';
import type { BlogLocale } from '~/types/blog';
import { draftFromPost, emptyDraft, patchFromDraft } from '~/utils/post-draft';

definePageMeta({ layout: 'admin', i18n: false, middleware: 'admin-auth' });

const api = useAdminApi();
const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));

const { data: post, status: loading, refresh } = await useAsyncData(
  'admin-post',
  () => api.get<AdminPostDetail>(`/api/admin/posts/${id.value}`),
);
watch(id, () => refresh());

const draft = reactive(emptyDraft());
watch(post, (value) => Object.assign(draft, draftFromPost(value ?? null)), { immediate: true });

const saving = ref(false);
const error = ref('');
const savedAt = ref<string | null>(null);

const changes = computed(() => (post.value ? patchFromDraft(post.value, draft) : {}));
const dirty = computed(() => Object.keys(changes.value).length > 0);
const { allowLeave } = useUnsavedGuard(() => dirty.value);

const save = async () => {
  if (saving.value || !dirty.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.patch(`/api/admin/posts/${id.value}`, changes.value);
    savedAt.value = new Date().toLocaleTimeString('uk-UA');
    // Re-read, because the server owns updatedAt and recomputes readingMinutes.
    await refresh();
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    saving.value = false;
  }
};
useSaveHotkey(save);

const target = ref<BlogStatus>(post.value?.status ?? 'draft');
const reason = ref('');
const moving = ref(false);
watch(post, (value) => { if (value) target.value = value.status; });

const applyStatus = async () => {
  if (moving.value || reason.value.trim().length < 8) return;
  moving.value = true;
  error.value = '';
  try {
    await api.post(`/api/admin/posts/${id.value}/status`, { status: target.value, reason: reason.value.trim() });
    reason.value = '';
    await refresh();
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    moving.value = false;
  }
};

const LOCALES: BlogLocale[] = ['uk', 'en', 'de', 'fr'];
const siblings = computed<AdminSibling[]>(() => post.value?.siblings ?? []);
/** Self is kept in `siblings` because it is what makes its own locale count as present. */
const translations = computed(() => siblings.value.filter((item) => item.id !== post.value?.id));
const missing = computed(() => LOCALES.filter((locale) => !siblings.value.some((item) => item.locale === locale)));
const seeding = ref<BlogLocale | null>(null);

/** The copy that seeds a translation is what keeps the hreflang cluster complete. */
const seed = async (locale: BlogLocale) => {
  seeding.value = locale;
  error.value = '';
  try {
    const created = await api.post<AdminPostDetail>(`/api/admin/posts/${id.value}/translations`, { locale });
    await navigateTo(`/admin/posts/${created.id}`);
  } catch (cause) {
    error.value = (cause as Error).message;
  } finally {
    seeding.value = null;
  }
};

const remove = async () => {
  if (!post.value) return;
  if (!window.confirm(`Видалити «${post.value.title}» (${post.value.locale}) назавжди?`)) return;
  try {
    await api.del(`/api/admin/posts/${id.value}`);
    allowLeave();
    await navigateTo('/admin');
  } catch (cause) {
    error.value = (cause as Error).message;
  }
};

const publicPath = computed(() => {
  if (!post.value) return '';
  const { locale, slug } = post.value;
  return `${locale === 'uk' ? '' : `/${locale}`}/blog/${slug}`;
});
</script>

<template>
  <div v-if="loading === 'pending' && !post" class="adm__muted">Завантаження…</div>

  <div v-else-if="!post" class="adm__note">
    <p>Пост не знайдений. Можливо, його видалено в іншій вкладці.</p>
    <NuxtLink class="adm__link" to="/admin">← до списку</NuxtLink>
  </div>

  <div v-else>
    <div class="adm__between">
      <h1>{{ post.title }}</h1>
      <div class="adm__row">
        <span class="adm__chip" :class="`adm__chip--${post.status}`">{{ post.status }}</span>
        <a v-if="post.status === 'published'" class="adm__link" :href="publicPath" target="_blank" rel="noopener">Відкрити на сайті ↗</a>
        <NuxtLink class="adm__link" to="/admin">← список</NuxtLink>
      </div>
    </div>

    <AdminPostEditor :draft="draft" :locale="post.locale" locked-locale :saving="saving" :error="error" :saved-at="savedAt" @save="save" />

    <div class="adm__panel" style="margin-top: 22px">
      <h2>Переклади цієї ж статті</h2>
      <div class="adm__row" style="margin-top: 10px">
        <NuxtLink v-for="sibling in translations" :key="sibling.id" :to="`/admin/posts/${sibling.id}`" class="adm__chip">
          {{ sibling.locale }} · {{ sibling.status }} · {{ sibling.slug }}
        </NuxtLink>
      </div>
      <div class="adm__row" style="margin-top: 12px">
        <span class="adm__muted">Немає версії:</span>
        <button
          v-for="locale in missing"
          :key="locale"
          type="button"
          class="adm__tool"
          :disabled="seeding !== null"
          @click="seed(locale)"
        >
          {{ seeding === locale ? '…' : `створити ${locale}` }}
        </button>
        <span v-if="!missing.length" class="adm__muted">всі чотири є</span>
      </div>
      <p class="adm__hint">
        Кнопка копіює заголовок, теґи й обкладинку, тіло лишає порожнім — і кластер hreflang
        залишається повним, а не обіцяє переклад, якого ніхто не написав.
      </p>
    </div>

    <div class="adm__panel" style="margin-top: 22px">
      <h2>Статус і журнал</h2>
      <div class="adm__row" style="margin-top: 12px">
        <select v-model="target" class="adm__select" aria-label="Новий статус">
          <option value="draft">чернетка</option>
          <option value="published">опубліковано</option>
          <option value="archived">архів</option>
        </select>
        <input v-model="reason" class="adm__input" style="flex: 1" type="text" maxlength="500" placeholder="Причина (від 8 символів) — потрапить у admin_audit_logs">
        <button
          type="button"
          class="adm__btn adm__btn--gold"
          :disabled="moving || reason.trim().length < 8 || target === post.status || dirty"
          @click="applyStatus"
        >
          {{ moving ? '…' : 'Застосувати' }}
        </button>
      </div>
      <p v-if="dirty" class="adm__hint">Спочатку збережи зміни — статус не повинен їх загубити.</p>
      <p v-else-if="reason.trim().length && reason.trim().length < 8" class="adm__hint">Ще {{ 8 - reason.trim().length }} символів причини.</p>
      <p v-else class="adm__hint">
        Публікація рухає <code>datePublished</code> лише вперше: при повторній публікації та сама
        дата лишається в індексі, а зміну несе <code>updatedAt</code>.
      </p>

      <hr style="border: 0; border-top: 1px solid var(--hairline); margin: 18px 0">
      <div class="adm__row">
        <span class="adm__muted">Видалення прибирає і обкладинку зі сховища.</span>
        <button type="button" class="adm__btn adm__btn--danger" @click="remove">Видалити пост</button>
      </div>
    </div>
  </div>
</template>

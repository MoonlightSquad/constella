<script setup lang="ts">
const props = defineProps<{ placement: 'footer' | 'article' }>();
const { t } = useI18n();
const inputId = `newsletter-email-${useId()}`;

const email = ref('');
const honeypot = ref('');
const busy = ref(false);
const outcome = ref<'ok' | 'error' | null>(null);

const submit = async () => {
  if (busy.value) return;
  busy.value = true;
  outcome.value = null;
  let accepted = false;
  try {
    await $fetch('/api/newsletter', { method: 'POST', body: { email: email.value, website: honeypot.value } });
    accepted = true;
    email.value = '';
  } catch {
    // The upstream reason stays on the server: what the visitor needs is one honest sentence.
  } finally {
    busy.value = false;
    outcome.value = accepted ? 'ok' : 'error';
    if (accepted) window.plausible?.('Newsletter signup', { props: { placement: props.placement } });
  }
};
</script>

<template>
  <form class="newsletter" @submit.prevent="submit">
    <p class="newsletter__title">{{ $t('blog.newsletter.title') }}</p>
    <div class="newsletter__row">
      <label class="newsletter__label" :for="inputId">{{ $t('blog.newsletter.label') }}</label>
      <input
        :id="inputId"
        v-model="email"
        class="newsletter__input"
        name="email"
        type="email"
        maxlength="254"
        autocomplete="email"
        required
        :disabled="busy"
      >
      <button class="btn btn-gold" type="submit" :disabled="busy">{{ $t('blog.newsletter.cta') }}</button>
    </div>
    <p class="newsletter__hint">{{ $t('blog.newsletter.consent') }}</p>
    <p
      v-if="outcome"
      class="newsletter__result"
      :class="`newsletter__result--${outcome}`"
      role="status"
      aria-live="polite"
    >
      {{ outcome === 'ok' ? $t('blog.newsletter.ok') : $t('blog.newsletter.error') }}
    </p>
    <!-- Bot bait: a real visitor never sees or focuses it, the server answers it with `ok`. -->
    <input
      v-model="honeypot"
      class="newsletter__trap"
      name="website"
      type="text"
      tabindex="-1"
      autocomplete="off"
      aria-hidden="true"
    >
  </form>
</template>

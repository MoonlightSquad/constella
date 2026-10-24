<template>
  <section id="ai" class="section shell">
    <div class="ai-layout">
      <div>
        <p class="eyebrow">{{ $t('landing.ai.badge') }}</p>
        <h2 class="section-title">{{ $t('landing.ai.title') }}</h2>
        <p class="section-sub">{{ $t('landing.ai.subtitle') }}</p>

        <ul class="ai-list">
          <li v-for="n in 4" :key="n" class="ai-item">
            <h3>{{ $t(`landing.ai.feat${n}Title`) }}</h3>
            <p>{{ $t(`landing.ai.feat${n}Desc`) }}</p>
          </li>
        </ul>

        <p class="note">
          <span aria-hidden="true">🕐</span>
          <span>{{ $t('landing.ai.soonNote') }}</span>
        </p>
      </div>

      <div class="chat-mock is-concept" :aria-label="$t('landing.ai.demoHeader')">
        <div class="chat-mock__head">
          <span>{{ $t('landing.ai.demoHeader') }}</span>
          <span class="chip chip--soon">{{ $t('landing.ai.demoBadge') }}</span>
        </div>
        <div class="chat-mock__body">
          <div class="chat-profile">
            <strong>{{ $t('landing.ai.demoProfileName') }}</strong>
            <p>{{ $t('landing.ai.demoProfileBio') }}</p>
          </div>
          <div class="bubble bubble--ai">
            <div class="bubble__label">{{ $t('landing.ai.demoPromptTitle') }}</div>
            {{ $t('landing.ai.demoPromptText') }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

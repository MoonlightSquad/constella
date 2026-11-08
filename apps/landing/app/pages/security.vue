<script setup lang="ts">
type CoverageItem = { title: string; description: string };
type FindingItem = {
  severity: string;
  tone: 'high' | 'medium';
  status: string;
  confidence: string;
  title: string;
  problem: string;
  change: string;
};

const { t, tm, localeProperties } = useI18n();
const { siteUrl } = useRuntimeConfig().public;
const { bot } = useSiteLinks();
const localePath = useLocalePath();
const coverage = computed(() => tm('meta.security.coverage') as CoverageItem[]);
const findings = computed(() => tm('meta.security.findings') as FindingItem[]);
const prerequisites = computed(() => tm('meta.security.prerequisites') as string[]);
const methodSteps = computed(() => tm('meta.security.methodSteps') as string[]);
const limitations = computed(() => tm('meta.security.limitations') as string[]);

useSeoMeta({
  title: () => t('meta.security.title'),
  description: () => t('meta.security.description'),
  ogTitle: () => t('meta.security.title'),
  ogDescription: () => t('meta.security.description'),
  ogType: 'article',
  ogImage: `${siteUrl}/og/default.png`,
  twitterCard: 'summary_large_image',
});

useJsonLd(() => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: t('meta.security.title'),
  description: t('meta.security.description'),
  url: `${siteUrl}${localePath('/security')}`,
  inLanguage: localeProperties.value?.language ?? 'uk-UA',
  dateModified: '2026-11-05',
}));
</script>

<template>
  <section class="section security-page">
    <div class="shell">
      <header class="security-hero">
        <div class="security-hero__copy">
          <p class="eyebrow">{{ t('meta.security.eyebrow') }}</p>
          <h1 class="section-title">{{ t('meta.security.title') }}</h1>
          <p class="section-sub">{{ t('meta.security.intro') }}</p>
        </div>
        <aside class="security-stamp" :aria-label="t('meta.security.reviewLabel')">
          <span class="security-stamp__label">{{ t('meta.security.reviewLabel') }}</span>
          <time class="security-stamp__date" datetime="2026-11-05">{{ t('meta.security.reviewDate') }}</time>
          <span class="security-stamp__scope">{{ t('meta.security.reviewType') }}</span>
        </aside>
      </header>

      <section class="security-outcome" aria-labelledby="security-outcome-title">
        <span class="security-outcome__mark" aria-hidden="true">{{ findings.length }}</span>
        <div>
          <p class="eyebrow">{{ t('meta.security.outcomeEyebrow') }}</p>
          <h2 id="security-outcome-title">{{ t('meta.security.outcomeTitle') }}</h2>
          <p>{{ t('meta.security.outcomeText') }}</p>
        </div>
      </section>

      <section class="security-section" aria-labelledby="security-findings-title">
        <div class="section-head">
          <p class="eyebrow">{{ t('meta.security.findingsEyebrow') }}</p>
          <h2 id="security-findings-title" class="section-title">{{ t('meta.security.findingsTitle') }}</h2>
          <p class="section-sub">{{ t('meta.security.findingsIntro') }}</p>
        </div>
        <div class="security-grid">
          <article v-for="(finding, index) in findings" :key="finding.title" class="security-card">
            <span class="security-card__index">{{ String(index + 1).padStart(2, '0') }}</span>
            <p class="security-card__badges">
              <span class="chip" :class="`chip--${finding.tone}`">{{ finding.severity }}</span>
              <span class="chip chip--fixed">{{ finding.status }}</span>
            </p>
            <h3>{{ finding.title }}</h3>
            <p class="security-finding__label">{{ t('meta.security.problemLabel') }}</p>
            <p>{{ finding.problem }}</p>
            <p class="security-finding__label">{{ t('meta.security.changedLabel') }}</p>
            <p>{{ finding.change }}</p>
            <p class="security-finding__meta">
              {{ t('meta.security.confidenceLabel') }} {{ finding.confidence }}
            </p>
          </article>
        </div>
        <p class="security-note">{{ t('meta.security.scopeNote') }}</p>
      </section>

      <section class="security-section" aria-labelledby="security-coverage-title">
        <div class="section-head">
          <p class="eyebrow">{{ t('meta.security.coverageEyebrow') }}</p>
          <h2 id="security-coverage-title" class="section-title">{{ t('meta.security.coverageTitle') }}</h2>
          <p class="section-sub">{{ t('meta.security.coverageIntro') }}</p>
        </div>
        <div class="security-grid">
          <article v-for="(item, index) in coverage" :key="item.title" class="security-card">
            <span class="security-card__index">{{ String(index + 1).padStart(2, '0') }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </article>
        </div>
      </section>

      <div class="security-details">
        <section class="security-panel" aria-labelledby="security-method-title">
          <p class="eyebrow">{{ t('meta.security.methodEyebrow') }}</p>
          <h2 id="security-method-title">{{ t('meta.security.methodTitle') }}</h2>
          <p>{{ t('meta.security.methodIntro') }}</p>
          <ol class="security-steps">
            <li v-for="step in methodSteps" :key="step">{{ step }}</li>
          </ol>
        </section>

        <aside class="security-panel security-panel--limits" aria-labelledby="security-limits-title">
          <p class="eyebrow">{{ t('meta.security.limitsEyebrow') }}</p>
          <h2 id="security-limits-title">{{ t('meta.security.limitsTitle') }}</h2>
          <ul class="security-limits">
            <li v-for="limitation in limitations" :key="limitation">{{ limitation }}</li>
          </ul>
        </aside>
      </div>

      <section class="security-panel security-panel--verify" aria-labelledby="security-prereq-title">
        <p class="eyebrow">{{ t('meta.security.prereqEyebrow') }}</p>
        <h2 id="security-prereq-title">{{ t('meta.security.prereqTitle') }}</h2>
        <p>{{ t('meta.security.prereqIntro') }}</p>
        <ul class="security-limits">
          <li v-for="prerequisite in prerequisites" :key="prerequisite">{{ prerequisite }}</li>
        </ul>
      </section>

      <div class="security-contact">
        <div>
          <h2>{{ t('meta.security.contactTitle') }}</h2>
          <p>{{ t('meta.security.contactText') }}</p>
        </div>
        <a class="btn btn-gold" :href="bot" rel="noopener noreferrer">{{ t('meta.security.contactCta') }}</a>
      </div>
      <p class="security-disclaimer">{{ t('meta.security.disclaimer') }}</p>
    </div>
  </section>
</template>

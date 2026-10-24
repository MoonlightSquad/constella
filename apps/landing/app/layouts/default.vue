<template>
  <div>
    <a class="skip-link" href="#main">{{ $t('common.skipToContent') }}</a>
    <div class="starfield" aria-hidden="true" />
    <LandingHeader />
    <main id="main">
      <slot />
    </main>
    <LandingFooter />
    <LandingInstallModal />
  </div>
</template>

<script setup lang="ts">
// Zentriertes Layout ohne Navigation — für Login/Register
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <main class="relative flex min-h-screen flex-col items-center justify-center gap-5 p-8">
    <UButton
      :to="localePath('/')"
      icon="i-ph-arrow-left"
      color="neutral"
      variant="ghost"
      class="fixed start-4 top-4 z-40"
      data-back-link
    >
      {{ t('ui.backToHome') }}
    </UButton>
    <AuthBrandHeader />
    <slot />
    <ConsentCookieBanner />
  </main>
</template>

<script setup lang="ts">
// App-Override des Core-auth-Layouts: zentriert, ohne Navigation, aber mit dem
// DisplaySettingsMenu (Theme/Variant/Appearance/Language) oben rechts und dem
// Zurück-zur-Startseite-Button oben links (wie im Core-Layout).
//
// SPIEGELPFLICHT: <AuthBrandHeader /> (Audit-Befund B3) gehört in JEDES
// auth-Layout — dieser Override verdeckt das Core-Layout komplett. Die Logik
// steckt in der Core-Komponente, hier steht nur die eine Zeile.
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
    <div class="fixed end-4 top-4 z-40">
      <DisplaySettingsMenu />
    </div>

    <AuthBrandHeader />
    <slot />
    <ConsentCookieBanner />
  </main>
</template>

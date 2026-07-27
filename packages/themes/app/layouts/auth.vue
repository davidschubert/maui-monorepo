<script setup lang="ts">
// Layer-Override des Core-auth-Layouts (Layout-Konsolidierung S9/K7, vorher
// App-Kopie in apps/comments): gleicher Aufbau — zentriert, ohne Navigation,
// Zurück-Button oben links — plus das DisplaySettingsMenu (Theme/Variant/
// Appearance/Sprache) oben rechts. themes BESITZT das Menü und ist in allen
// Apps außer marketing extended; marketing behält bewusst die schlanke
// Core-Variante ohne Menü (Davids Entscheidung 2, 2026-07-27). Die frühere
// „Spiegelpflicht" (App-Override musste <AuthBrandHeader /> nachziehen)
// entfällt: es gibt nur noch DIESEN einen Override.
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

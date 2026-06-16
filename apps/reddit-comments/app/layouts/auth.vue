<script setup lang="ts">
// App-Override des Core-auth-Layouts: zentriert, ohne Navigation, aber mit dem
// DisplaySettingsMenu (Theme/Variant/Appearance/Language) oben rechts.
</script>

<template>
  <main class="relative flex min-h-screen items-center justify-center p-8">
    <div class="fixed end-4 top-4 z-40">
      <DisplaySettingsMenu />
    </div>

    <slot />
    <ConsentCookieBanner />
  </main>
</template>

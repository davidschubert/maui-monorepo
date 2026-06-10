<script setup lang="ts">
// Zentriertes Layout ohne Navigation — für Login/Register
</script>

<template>
  <main class="flex min-h-screen items-center justify-center p-8">
    <slot />
    <ConsentCookieBanner />
  </main>
</template>

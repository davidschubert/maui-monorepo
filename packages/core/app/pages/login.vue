<script setup lang="ts">
// Out-of-the-box Login-Page aus dem Core — Apps können sie überschreiben
definePageMeta({ middleware: 'guest' })
</script>

<template>
  <main class="flex min-h-screen items-center justify-center p-8">
    <AuthLoginForm class="w-full max-w-sm" />
  </main>
</template>

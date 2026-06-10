<script setup lang="ts">
// Out-of-the-box Login-Page aus dem Core — Apps können sie überschreiben
definePageMeta({ layout: 'auth', middleware: 'guest' })
</script>

<template>
  <AuthLoginForm class="w-full max-w-sm" />
</template>

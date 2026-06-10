<script setup lang="ts">
// Out-of-the-box Register-Page aus dem Core — Apps können sie überschreiben
definePageMeta({ layout: 'auth', middleware: 'guest' })
</script>

<template>
  <AuthRegisterForm class="w-full max-w-sm" />
</template>

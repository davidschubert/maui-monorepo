<script setup lang="ts">
// Settings → Security: Passwort ändern + Account löschen (beides Core-Komponenten)
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })
</script>

<template>
  <AuthPasswordChangeForm />
  <AuthAccountDeleteCard />
</template>

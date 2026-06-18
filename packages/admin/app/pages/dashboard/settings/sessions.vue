<script setup lang="ts">
// Settings → Sessions: eigene aktive Sessions des Users (Core-Komponente)
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })
</script>

<template>
  <AuthAccountSessionsCard />
</template>

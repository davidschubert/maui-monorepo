<script setup lang="ts">
/** Studio-Editor: neues Theme anlegen (dünner Wrapper um StudioEditor). */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })
</script>

<template>
  <StudioEditor />
</template>

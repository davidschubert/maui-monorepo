<script setup lang="ts">
/** Theme-Editor: neues Theme anlegen (dünner Wrapper um CustomizeEditor). */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })
</script>

<template>
  <CustomizeEditor />
</template>

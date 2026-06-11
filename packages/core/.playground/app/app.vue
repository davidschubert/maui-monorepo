<script setup lang="ts">
// Playground: isolierte Dev-Umgebung für den Core Layer (Port 3000).
// Mit NuxtPage, weil der Core Pages mitbringt (login/register) —
// ohne matchende Route gäbe es sonst 404 auf /.
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

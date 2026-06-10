<script setup lang="ts">
import type { NuxtError } from '#app'

// error.vue muss in der App liegen (Nuxt löst sie nicht aus Layern auf)
defineProps<{ error: NuxtError }>()
</script>

<template>
  <CoreErrorPage :error="error" />
</template>

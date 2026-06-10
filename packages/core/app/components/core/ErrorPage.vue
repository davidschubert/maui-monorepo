<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * Core-Fehlerseite. Nuxt löst error.vue NICHT aus Layern auf — jede App
 * legt daher eine dünne app/error.vue an, die diese Komponente rendert:
 *
 *   <template><CoreErrorPage :error="error" /></template>
 */
defineProps<{ error: NuxtError }>()
</script>

<template>
  <UApp>
    <main class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p class="font-mono text-sm text-muted">MAUI-ERROR</p>
      <h1 class="text-5xl font-bold">{{ error.statusCode }}</h1>
      <p class="text-muted">
        {{ error.statusCode === 404 ? 'Diese Seite existiert nicht.' : 'Da ist etwas schiefgelaufen.' }}
      </p>
      <UButton @click="clearError({ redirect: '/' })">Zur Startseite</UButton>
    </main>
  </UApp>
</template>

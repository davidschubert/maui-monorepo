<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * Core-Fehlerseite. Nuxt löst error.vue NICHT aus Layern auf — jede App
 * legt daher eine dünne app/error.vue an, die diese Komponente rendert:
 *
 *   <template><CoreErrorPage :error="error" /></template>
 */
const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const localePath = useLocalePath()
// EINE Brand-Kette für alle (useBrandName: Tenant vor App-Brand vor
// „Maui"-Fallback) — vorher stand hier hart „MAUI-ERROR" (Audit B2/K3).
const brand = useBrandName()

const status = computed(() => props.error?.statusCode ?? 500)
const description = computed(() => (status.value === 404 ? t('error.notFound') : t('error.generic')))

// Titel statt nackter URL im Tab/in geteilten Links: „404 · Morgenlicht"
useHead({ title: () => `${status.value} · ${brand.value}` })
</script>

<template>
  <UApp>
    <main class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p class="text-sm font-medium text-muted">{{ brand }}</p>
      <h1 class="text-5xl font-bold">{{ status }}</h1>
      <p class="text-muted">{{ description }}</p>
      <UButton @click="clearError({ redirect: localePath('/') })">{{ t('error.backHome') }}</UButton>
    </main>
  </UApp>
</template>

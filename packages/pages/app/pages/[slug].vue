<script setup lang="ts">
import type { PublicPage } from '../../shared/types/page'

/**
 * Öffentliche Inhaltsseite unter sprechendem Pfad (/imprint, /terms …).
 * Dynamische Route mit NIEDRIGER Priorität — statische App-Routen (/login,
 * /dashboard …) gewinnen. Nur veröffentlichte Seiten; sonst 404.
 */
const route = useRoute()
const { locale } = useI18n()
const slug = computed(() => String(route.params.slug ?? ''))

// useRequestFetch statt $fetch: der SSR-interne Aufruf MUSS den Host-Header
// (= Tenant) der eingehenden Anfrage weiterreichen, sonst löst die Tenant-
// Middleware im Pool keinen Mandanten auf und JEDE Inhaltsseite wäre 404 —
// genau so auf demo.pukalani.app gefunden (Morgenlicht-Seed, 2026-07-26).
// Im Silo-Betrieb verhält sich useRequestFetch wie $fetch.
const requestFetch = useRequestFetch()
const { data: page, error } = await useAsyncData(
  () => `page-${slug.value}-${locale.value}`,
  () => requestFetch<PublicPage>(`/api/pages/public/${slug.value}`, { query: { locale: locale.value } }),
  { watch: [locale] },
)

if (error.value || !page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

useHead({ title: () => page.value?.title ?? '' })
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <article v-if="page" class="mx-auto max-w-3xl space-y-3">
      <h1 class="text-2xl font-bold">{{ page.title }}</h1>
      <MarkdownContent :source="page.body" />
    </article>
  </UContainer>
</template>

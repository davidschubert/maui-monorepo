<script setup lang="ts">
import type { PublicPage } from '../../../../packages/pages/shared/types/page'

/**
 * Tenant-Homepage (H3, „pro Tenant konfigurierbar"): rendert die im Dashboard
 * gepflegte `home`-Seite des Request-Tenants (pages-Layer, tenant-gescopt).
 * Fällt auf eine schlichte Willkommens-Seite zurück, solange kein home-Eintrag
 * existiert. MVP: CMS-Markdown (sicheres Subset via MarkdownContent, kein
 * v-html) + optional EIN Kommentar-Block: die Zeile `[[comments]]` im Body
 * wird zur CommentSection (targetType 'page', targetId 'home').
 */
const { t, locale } = useI18n()

// useRequestFetch: der SSR-interne Aufruf MUSS den Host-Header (= Tenant)
// der eingehenden Anfrage weiterreichen, sonst löst die Tenant-Middleware
// den falschen/keinen Mandanten auf und die home-Seite bliebe leer.
const requestFetch = useRequestFetch()
const { data: page } = await useAsyncData(
  () => `home-${locale.value}`,
  () => requestFetch<PublicPage>('/api/pages/public/home', { query: { locale: locale.value } }).catch(() => null),
  { watch: [locale] },
)

// `[[comments]]` (eigene Zeile) trennt den Markdown-Body vom Kommentar-Block.
const COMMENT_MARKER = /^\s*\[\[comments\]\]\s*$/m
const parts = computed(() => {
  const body = page.value?.body ?? ''
  const idx = body.search(COMMENT_MARKER)
  if (idx === -1) return { markdown: body, showComments: false }
  return { markdown: body.slice(0, idx), showComments: true }
})

useHead({ title: () => page.value?.title ?? t('app.tagline') })
</script>

<template>
  <UContainer class="py-8 sm:py-12">
    <article v-if="page" class="mx-auto max-w-3xl space-y-4">
      <h1 class="text-2xl font-bold tracking-tight">{{ page.title }}</h1>
      <MarkdownContent :source="parts.markdown" />
      <CommentSection
        v-if="parts.showComments"
        target-id="home"
        target-type="page"
        class="mt-8"
      />
    </article>

    <section v-else class="mx-auto max-w-2xl py-16 text-center">
      <h1 class="text-3xl font-bold tracking-tight">{{ t('app.tagline') }}</h1>
      <p class="mt-4 text-muted">{{ t('home.subtitle') }}</p>
    </section>
  </UContainer>
</template>

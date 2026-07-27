<script setup lang="ts">
import { pageExcerpt } from '../../../../packages/pages/shared/pageExcerpt'
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

// „<Seitenname> · <Brand>", ohne home-Eintrag der Brand allein (Audit S8) +
// Beschreibung aus dem ersten Textabsatz der home-Seite (S5). Vorher stand hier
// als Fallback die Betreiber-Tagline im Tab JEDES Mandanten (K11).
// Ohne home-Eintrag bleibt die description WEG: der Platzhaltertext der
// Willkommens-Sektion ist keine Beschreibung dieses Mandanten (K11).
useBrandTitle(() => page.value?.title ?? '', {
  description: () => (page.value ? pageExcerpt(parts.value.markdown) : undefined),
})
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

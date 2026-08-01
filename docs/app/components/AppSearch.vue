<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

/**
 * Volltextsuche der Doku-Site (C8).
 *
 * Zwei Teile, die zusammengehören und deshalb in EINER Komponente stehen
 * (app.vue UND error.vue brauchen beide die Suche — vorher stand der Block
 * zweimal da und wäre beim nächsten Handgriff auseinandergelaufen):
 *  - `queryCollectionSearchSections('docs')` zerlegt jede Seite an ihren
 *    Überschriften in Abschnitte. Ein Treffer führt damit auf `#anker`, nicht
 *    nur auf die Seite. Bewusst `server: false`: der Index ist nur für den
 *    Browser, er hat im SSR-Payload jeder Seite nichts zu suchen.
 *  - `UContentSearch` ist der Befehlspalette-Dialog (⌘K / Strg+K, Pfeiltasten,
 *    Enter) — die Tastaturführung kommt fertig mit.
 *
 * Kein externer Dienst: gesucht wird im Browser über den Abschnitts-Index,
 * die Inhalte kommen aus der lokalen Content-Datenbank.
 */
const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('docs'), {
  server: false,
})
</script>

<template>
  <ClientOnly>
    <LazyUContentSearch
      :files="files"
      :navigation="navigation"
      placeholder="Doku durchsuchen …"
      title="Suche"
      description="Durchsuche die Pukalani-Dokumentation."
    />
  </ClientOnly>
</template>

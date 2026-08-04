<script setup lang="ts">
/**
 * Die Zusatz-Punkte unter der Discussions-Seitenleiste (F1 Stufe 2).
 *
 * WARUM SIE NICHT IN `DiscussionSidebar` STEHEN (dem naheliegenden Ort): jene
 * Komponente gehört dem posts-Layer, und diese Punkte hängen an anderen Layern
 * — „Über" führt zu einer Seite, die drei Layer zusammenrechnet, „Regeln" zu
 * einem Text aus dem pages-Layer. Ein Produkt-Layer darf einen anderen nicht
 * kennen (A14); die Verdrahtung gehört nach blueprint. Deshalb steht die
 * Kategorien-Leiste weiter in posts und dieser Anhang daneben.
 */
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <nav class="mt-6 border-t border-default pt-3">
    <ul class="space-y-1 text-sm">
      <li>
        <NuxtLink
          :to="localePath('/discussions/about')"
          class="block truncate rounded px-2 py-1 text-muted hover:bg-elevated/50 hover:text-default"
        >
          {{ t('posts.discussions.about.title') }}
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

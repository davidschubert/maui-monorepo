<script setup lang="ts">
/**
 * BAUPLAN-Komposition Discussions-Übersicht (F1 Stufe 1).
 *
 * Wie feed.vue: der posts-Layer bringt die Tabelle mit, der comments-Layer die
 * Antwort-Anzahlen, und genau hier — im einzigen Layer, der beide kennen darf
 * (A14) — werden sie verdrahtet. Damit sehen Pool und Silo dasselbe Produkt
 * (PRODUKT-BILANZ.md).
 *
 * ZWEI ANSICHTEN, EINE SEITE: `?order=categories` zeigt statt der Themen die
 * Kategorien-Tabelle (Name + Beschreibung | Anzahl). Bewusst kein eigener Pfad
 * — es ist eine SORTIERUNG derselben Liste, so steht es im Konzept, und ein
 * eigener Pfad hätte den sechsten Seitenleisten-Link zu einem Ortswechsel
 * gemacht statt zu einer Umschaltung.
 */
const { t } = useI18n()
const route = useRoute()

useBrandTitle(() => t('posts.discussions.title'), { description: () => t('posts.discussions.description') })

const showCategories = computed(() => route.query.order === 'categories')

const { replyCounts, loadCounts } = useDiscussionReplyCounts()
</script>

<template>
  <UContainer class="max-w-5xl py-8">
    <h1 class="text-2xl font-bold">{{ t('posts.discussions.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('posts.discussions.description') }}</p>

    <div class="mt-6 flex flex-col gap-6 md:flex-row">
      <!-- Seitenleiste zuerst im Markup, aber rechts daneben: sie ist
           Navigation und gehört auf schmalen Schirmen über die Liste. -->
      <aside class="md:w-48 md:shrink-0">
        <DiscussionSidebar />
        <DiscussionSidebarLinks />
      </aside>

      <div class="min-w-0 flex-1">
        <DiscussionCategories v-if="showCategories" />
        <DiscussionTopics v-else :reply-counts="replyCounts" @rows-changed="loadCounts" />
      </div>
    </div>
  </UContainer>
</template>

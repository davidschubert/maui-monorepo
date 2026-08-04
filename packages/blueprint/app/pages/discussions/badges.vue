<script setup lang="ts">
/**
 * BAUPLAN-Komposition Abzeichen (F1 Stufe 4).
 *
 * Derselbe Rahmen wie die Übersicht und die About-Seite: die Seitenleiste
 * kommt aus zwei Layern (Kategorien aus `posts`, Zusatz-Punkte aus dem
 * Bauplan), der Inhalt aus `posts`. Die SEITE liegt hier und nicht in `posts`,
 * weil `/discussions/*` der Adressraum des Bauplans ist — dort entscheidet
 * sich, was Pool und Silo gleichermaßen zu sehen bekommen (PRODUKT-BILANZ.md).
 *
 * Sie steht als STATISCHER Pfad neben `[category]` und geht deshalb vor: eine
 * Kategorie mit dem Slug „badges" wäre nicht verdeckt, sondern UNERREICHBAR.
 * Deshalb steht der Name jetzt in `RESERVED_CATEGORY_SLUGS` — zusammen mit
 * „about", das dort seit Stufe 2 fehlte.
 */
const { t } = useI18n()

useBrandTitle(() => t('posts.discussions.badges.title'), { description: () => t('posts.discussions.badges.description') })
</script>

<template>
  <UContainer class="max-w-5xl py-8">
    <div class="flex flex-col gap-6 md:flex-row">
      <aside class="md:w-48 md:shrink-0">
        <DiscussionSidebar />
        <DiscussionSidebarLinks />
      </aside>

      <div class="min-w-0 flex-1">
        <DiscussionBadges />
      </div>
    </div>
  </UContainer>
</template>

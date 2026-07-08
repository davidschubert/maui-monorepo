<script setup lang="ts">
/**
 * Header-Trigger + Slideover mit dem Activity-Feed — für die Startseite/
 * Layouts, ohne die Seite zu verlassen. Die /feed-Seite bleibt für
 * Deep-Links bestehen (Footer-Link). Der Feed lädt erst beim Öffnen
 * (unmountOnHide-Default) — kein Fetch auf jedem Seitenaufruf.
 */
const { t } = useI18n()
const localePath = useLocalePath()

const open = ref(false)

// Klick auf einen Eintrag navigiert intern — das Slideover soll dann zu sein
function onBodyClick(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('a')) open.value = false
}
</script>

<template>
  <USlideover v-model:open="open" :title="t('feed.title')" :description="t('feed.description')">
    <UButton color="neutral" variant="ghost" icon="i-ph-pulse" :aria-label="t('feed.title')" data-testid="feed-link">
      <!-- Header-Trigger: unter md nur Icon, damit schmale Header nicht überlaufen -->
      <span class="hidden md:inline">{{ t('feed.title') }}</span>
    </UButton>

    <template #body>
      <!-- ActivityFeed hat async setup (useFetch) → braucht hier eine eigene
           Suspense-Grenze, das Slideover ist keine Page -->
      <div @click="onBodyClick">
        <Suspense>
          <ActivityFeed />
          <template #fallback>
            <div class="flex justify-center py-12">
              <UIcon name="i-ph-circle-notch" class="size-6 animate-spin text-muted" />
            </div>
          </template>
        </Suspense>
      </div>
    </template>

    <template #footer>
      <UButton
        :to="localePath('/feed')"
        color="neutral"
        variant="link"
        icon="i-ph-arrow-right"
        data-testid="feed-page-link"
        @click="open = false"
      >
        {{ t('feed.openPage') }}
      </UButton>
    </template>
  </USlideover>
</template>

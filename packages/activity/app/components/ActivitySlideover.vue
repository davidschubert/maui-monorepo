<script setup lang="ts">
/**
 * Header-Trigger + Slideover mit dem Activity-Feed — für die Startseite/
 * Layouts, ohne die Seite zu verlassen. Die /activity-Seite bleibt für
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
  <USlideover v-model:open="open" :title="t('activity.title')" :description="t('activity.description')">
    <UButton color="neutral" variant="ghost" icon="i-ph-pulse" :aria-label="t('activity.title')" data-testid="activity-link" />

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
        :to="localePath('/activity')"
        color="neutral"
        variant="link"
        icon="i-ph-arrow-right"
        data-testid="activity-page-link"
        @click="() => { open = false }"
      >
        {{ t('activity.openPage') }}
      </UButton>
    </template>
  </USlideover>
</template>

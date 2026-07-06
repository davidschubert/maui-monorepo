<script setup lang="ts">
const props = defineProps<{
  /** Moderations-Modus: Löschen-Buttons + Lösch-Aktion (dashboard/feed) */
  moderate?: boolean
}>()

const { t } = useI18n()
const toast = useToast()

// Infinite Scroll: Sentinel unter der Liste — sichtbar → nächste Seite laden.
// Hooks VOR dem await registrieren (async-setup-Stolperfalle, siehe
// useActivityFeed); der „Mehr laden"-Button bleibt als Fallback erhalten.
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | undefined
onMounted(() => {
  observer = new IntersectionObserver(async (entries) => {
    if (!entries.some(entry => entry.isIntersecting)) return
    await loadMore()
    // Re-arm: kurze Seiten lassen den Sentinel sichtbar — erneut beobachten
    // löst den nächsten Ladevorgang aus. Ohne nextCursor NICHT re-armen
    // (loadMore wäre ein no-op → Endlosschleife aus Observer-Callbacks).
    const el = sentinel.value
    if (el && observer && nextCursor.value) {
      observer.unobserve(el)
      observer.observe(el)
    }
  }, { rootMargin: '300px' })
  if (sentinel.value) observer.observe(sentinel.value)
})
onBeforeUnmount(() => observer?.disconnect())

const { rows, pending, nextCursor, loadingMore, loadMore, remove } = await useActivityFeed()

async function onRemove(id: string) {
  if (!props.moderate) return
  try {
    await remove(id)
    toast.add({ title: t('feed.deleted'), color: 'success' })
  }
  catch {
    toast.add({ title: t('feed.deleteFailed'), color: 'error' })
  }
}
</script>

<template>
  <div>
    <p v-if="!pending && rows.length === 0" class="py-12 text-center text-sm text-muted" data-feed-empty>
      {{ t('feed.empty') }}
    </p>

    <div v-else class="divide-y divide-default" data-feed-list>
      <ActivityItem
        v-for="activity in rows"
        :key="activity.$id"
        :activity="activity"
        :moderate="moderate"
        @remove="onRemove"
      />
    </div>

    <div ref="sentinel" aria-hidden="true" class="h-px" data-feed-sentinel />

    <div v-if="nextCursor" class="pt-4 text-center">
      <UButton
        color="neutral"
        variant="subtle"
        :loading="loadingMore"
        data-feed-load-more
        @click="loadMore"
      >
        {{ t('feed.loadMore') }}
      </UButton>
    </div>
  </div>
</template>

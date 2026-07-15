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

// Aufeinanderfolgende Einträge desselben Actors mit gleichem Typ zu EINER
// Zeile bündeln (Anti-Noise: „26× hat einen Kommentar geschrieben"). Der Kopf
// bleibt der neueste Eintrag, „+N weitere" klappt den Rest auf. Im
// Moderations-Modus wird NICHT gruppiert — Admins löschen einzelne Einträge.
interface FeedGroup { head: (typeof rows.value)[number], items: typeof rows.value }
const groups = computed<FeedGroup[]>(() => {
  const out: FeedGroup[] = []
  for (const row of rows.value) {
    const last = out.at(-1)
    if (!props.moderate && last && last.head.actorId === row.actorId && last.head.type === row.type) {
      last.items.push(row)
    }
    else {
      out.push({ head: row, items: [row] })
    }
  }
  return out
})
const expanded = ref(new Set<string>())
function expand(id: string) {
  expanded.value = new Set(expanded.value).add(id)
}

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
      <div v-for="group in groups" :key="group.head.$id" data-feed-group>
        <ActivityItem :activity="group.head" :moderate="moderate" @remove="onRemove" />

        <template v-if="group.items.length > 1">
          <div v-if="!expanded.has(group.head.$id)" class="pb-2 pl-12">
            <UButton
              color="neutral"
              variant="link"
              size="xs"
              data-feed-group-more
              @click="expand(group.head.$id)"
            >
              {{ t('feed.groupMore', { count: group.items.length - 1 }) }}
            </UButton>
          </div>
          <template v-else>
            <ActivityItem
              v-for="activity in group.items.slice(1)"
              :key="activity.$id"
              :activity="activity"
              :moderate="moderate"
              @remove="onRemove"
            />
          </template>
        </template>
      </div>
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

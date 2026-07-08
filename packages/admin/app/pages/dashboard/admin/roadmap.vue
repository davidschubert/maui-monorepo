<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'dashboard.access' })

/**
 * Interne Produkt-Roadmap (Now/Next/Later + kürzlich geliefert) — die Seite
 * ist generischer Layer-Baustein, die INHALTE liefert die App über
 * `maui.roadmap` (app.config, deep-merged). Bewusst reine Anzeige: die
 * Wahrheit der Planung bleibt docs/GOALS.md + docs/plans/*.
 */
interface RoadmapItem {
  title: string
  description?: string
  icon?: string
  /** z. B. „Phase 23" oder ein Plan-Verweis */
  ref?: string
}
interface RoadmapConfig {
  updatedAt?: string
  now?: RoadmapItem[]
  next?: RoadmapItem[]
  later?: RoadmapItem[]
  shipped?: RoadmapItem[]
}

const { t } = useI18n()
const appConfig = useAppConfig()

useHead({ title: () => t('admin.roadmap.title') })

const roadmap = computed<RoadmapConfig>(() =>
  ((appConfig.maui as { roadmap?: RoadmapConfig } | undefined)?.roadmap) ?? {})

const lanes = computed(() => [
  { id: 'now', labelKey: 'admin.roadmap.now', icon: 'i-ph-hammer', color: 'primary' as const, items: roadmap.value.now ?? [] },
  { id: 'next', labelKey: 'admin.roadmap.next', icon: 'i-ph-queue', color: 'info' as const, items: roadmap.value.next ?? [] },
  { id: 'later', labelKey: 'admin.roadmap.later', icon: 'i-ph-hourglass', color: 'neutral' as const, items: roadmap.value.later ?? [] },
])

const shipped = computed(() => roadmap.value.shipped ?? [])
const empty = computed(() => lanes.value.every(lane => lane.items.length === 0) && shipped.value.length === 0)
</script>

<template>
  <div>
    <div class="mb-6 flex items-end justify-between gap-4">
      <p class="text-sm text-muted">{{ t('admin.roadmap.description') }}</p>
      <p v-if="roadmap.updatedAt" class="shrink-0 text-xs text-dimmed">
        {{ t('admin.roadmap.updated', { date: roadmap.updatedAt }) }}
      </p>
    </div>

    <p v-if="empty" class="py-16 text-center text-sm text-muted" data-testid="roadmap-empty">
      {{ t('admin.roadmap.empty') }}
    </p>

    <div v-else class="grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="roadmap-lanes">
      <section v-for="lane in lanes" :key="lane.id" :data-roadmap-lane="lane.id">
        <h2 class="mb-3 flex items-center gap-2 font-semibold">
          <UIcon :name="lane.icon" class="size-4" />
          {{ t(lane.labelKey) }}
          <UBadge :color="lane.color" variant="subtle" size="sm">{{ lane.items.length }}</UBadge>
        </h2>
        <div class="space-y-3">
          <div
            v-for="item in lane.items"
            :key="item.title"
            class="rounded-lg border border-default p-3"
          >
            <p class="flex items-center gap-2 text-sm font-medium">
              <UIcon v-if="item.icon" :name="item.icon" class="size-4 shrink-0 text-muted" />
              {{ item.title }}
            </p>
            <p v-if="item.description" class="mt-1 text-xs leading-relaxed text-muted">{{ item.description }}</p>
            <UBadge v-if="item.ref" color="neutral" variant="outline" size="sm" class="mt-2">{{ item.ref }}</UBadge>
          </div>
          <p v-if="lane.items.length === 0" class="text-xs text-dimmed">—</p>
        </div>
      </section>
    </div>

    <section v-if="shipped.length > 0" class="mt-10" data-testid="roadmap-shipped">
      <h2 class="mb-3 flex items-center gap-2 font-semibold">
        <UIcon name="i-ph-check-circle" class="size-4 text-success" />
        {{ t('admin.roadmap.shipped') }}
      </h2>
      <ul class="space-y-1 text-sm text-muted">
        <li v-for="item in shipped" :key="item.title" class="flex items-center gap-2">
          <UIcon name="i-ph-check" class="size-3.5 shrink-0 text-success" />
          <span>{{ item.title }}</span>
          <UBadge v-if="item.ref" color="neutral" variant="outline" size="sm">{{ item.ref }}</UBadge>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SystemInfo } from '../../../shared/types/system'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const isDev = import.meta.dev

useHead({ title: () => t('dashboard.system.title') })

// Live-/per-Request-Daten ohne SEO-Relevanz → client-seitig (kein SSR-Render,
// sonst Hydration-Mismatch über uptime/memory/generatedAt).
const { data, status, refresh } = useFetch<SystemInfo>('/api/admin/system', {
  lazy: true,
  server: false,
})

// Eigener Refresh-State (nicht an `status` koppeln — sonst Hydration-Mismatch am
// Button: server idle, client pending). Spinnt nur beim manuellen Aktualisieren.
const refreshing = ref(false)
async function reload() {
  refreshing.value = true
  try {
    await refresh()
  }
  finally {
    refreshing.value = false
  }
}

const healthColor = { pass: 'success', fail: 'error', unknown: 'neutral' } as const

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts = d ? [`${d}d`, `${h}h`, `${m}m`] : h ? [`${h}h`, `${m}m`] : [`${m}m`, `${s}s`]
  return parts.join(' ')
}

const generatedAtLabel = computed(() => {
  if (!data.value) return ''
  return new Date(data.value.generatedAt).toLocaleString(locale.value)
})

const groupedDependencies = computed(() => {
  const groups = new Map<string, SystemInfo['dependencies']>()
  for (const dep of data.value?.dependencies ?? []) {
    const list = groups.get(dep.category) ?? []
    list.push(dep)
    groups.set(dep.category, list)
  }
  return [...groups.entries()].map(([category, items]) => ({ category, items }))
})

// Zwei Spalten je Kategorie-Tabelle: Paket und Version. Die Version steht
// rechts (wie vorher in der `<dl>`), deshalb trägt die Spalte ihre Ausrichtung
// selbst — Kopf und Zelle gemeinsam, sonst rutscht die Überschrift weg.
const dependencyColumns = computed<TableColumn<Dep>[]>(() => [
  { accessorKey: 'name', header: () => t('dashboard.system.stack.col.package') },
  {
    accessorKey: 'version',
    header: () => t('dashboard.system.stack.col.version'),
    meta: { class: { th: 'text-right', td: 'text-right' } },
  },
])

/**
 * Aufgeklappte Layer (Namen statt nur Counts). Das Auf- und Zuklappen macht
 * seit C12 `UCollapsible` — vorher war es ein handgebautes `<button>` mit
 * `aria-expanded` und zwei `v-if`-Zweigen. Der offene Zustand bleibt hier
 * (mehrere Layer dürfen gleichzeitig offen sein), `UCollapsible` bekommt ihn
 * je Karte gesetzt.
 */
const expandedLayers = ref(new Set<string>())
function setLayerOpen(name: string, open: boolean) {
  const next = new Set(expandedLayers.value)
  if (open) next.add(name)
  else next.delete(name)
  expandedLayers.value = next
}

const outdatedCount = computed(() => (data.value?.dependencies ?? []).filter(d => d.outdated === true).length)
const checkedCount = computed(() => (data.value?.dependencies ?? []).filter(d => d.outdated !== null && d.outdated !== undefined).length)

// --- Dev-only: Dependency-Update (Catalog-Bump + pnpm install) ----------------
type Dep = SystemInfo['dependencies'][number]
const justUpdated = ref(new Set<string>())

async function updateDep(dep: Dep) {
  try {
    let to = ''
    const ok = await confirm({
      title: t('dashboard.system.stack.updateTitle'),
      description: `${t('dashboard.system.stack.updateConfirm', { name: dep.name, from: dep.version, to: dep.latest })} ${t('dashboard.system.stack.updateNote')}`,
      confirmLabel: t('dashboard.system.stack.updateConfirmBtn'),
      color: 'warning',
      action: async () => {
        const res = await $fetch<{ to: string }>('/api/admin/system/update', { method: 'POST', body: { name: dep.name } })
        to = res.to
      },
    })
    if (!ok) return
    justUpdated.value = new Set(justUpdated.value).add(dep.name)
    toast.add({ title: t('dashboard.system.stack.updateStarted', { name: dep.name, version: to }), color: 'success', duration: 8000 })
  }
  catch {
    // Vorher stand hier der rohe `statusMessage` der Route — Entwickler-Text,
    // unübersetzt, und seit dem Fehler-Envelope ohnehin meist `undefined`
    // (also eine Fehlermeldung ganz ohne Beschreibung).
    toast.add({
      title: t('dashboard.system.stack.updateFailed'),
      description: t('dashboard.system.stack.updateFailedDesc'),
      color: 'error',
    })
  }
}
</script>

<template>
  <UDashboardPanel id="system" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar :title="t('dashboard.system.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            color="neutral"
            variant="subtle"
            :loading="refreshing"
            @click="reload()"
          >
            {{ t('dashboard.system.refresh') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:max-w-3xl lg:gap-8">
        <ClientOnly>
          <template #fallback>
            <div class="flex justify-center py-16">
              <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
            </div>
          </template>

          <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
            <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
          </div>

          <template v-else-if="data">
          <!-- Application -->
          <UPageCard :title="t('dashboard.system.app.title')" :description="t('dashboard.system.app.description')" variant="subtle">
            <dl class="w-full text-sm">
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.app.name') }}</dt>
                <dd class="font-medium">{{ data.app.name }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.app.version') }}</dt>
                <dd class="font-mono">{{ data.app.version }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.app.environment') }}</dt>
                <dd>
                  <UBadge :color="data.runtime.nodeEnv === 'production' ? 'success' : 'warning'" variant="subtle" size="sm">
                    {{ data.runtime.nodeEnv }}
                  </UBadge>
                </dd>
              </div>
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.app.url') }}</dt>
                <dd class="font-mono break-all">{{ data.app.url || '—' }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-2">
                <dt class="text-muted">{{ t('dashboard.system.app.avatarsBucket') }}</dt>
                <dd class="font-mono">{{ data.app.avatarsBucket || '—' }}</dd>
              </div>
            </dl>
          </UPageCard>

          <!-- Appwrite + Health -->
          <UPageCard :title="t('dashboard.system.appwrite.title')" :description="t('dashboard.system.appwrite.description')" variant="subtle">
            <dl class="w-full text-sm">
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.appwrite.version') }}</dt>
                <dd class="flex items-center gap-1.5 font-mono">
                  <span :class="data.appwrite.outdated ? 'text-warning' : ''">{{ data.appwrite.version || '—' }}</span>
                  <template v-if="data.appwrite.outdated">
                    <UIcon name="i-ph-arrow-right" class="size-3 text-dimmed" />
                    <span class="font-medium text-warning">{{ data.appwrite.latestVersion }}</span>
                  </template>
                  <UTooltip v-else-if="data.appwrite.outdated === false" :text="t('dashboard.system.stack.current')">
                    <UIcon name="i-ph-check-circle" class="size-4 text-success" />
                  </UTooltip>
                </dd>
              </div>
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.appwrite.endpoint') }}</dt>
                <dd class="font-mono break-all">{{ data.appwrite.endpoint }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.appwrite.project') }}</dt>
                <dd class="font-mono">{{ data.appwrite.projectId }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.appwrite.database') }}</dt>
                <dd class="font-mono">{{ data.appwrite.databaseId }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-2">
                <dt class="text-muted">{{ t('dashboard.system.appwrite.timeDiff') }}</dt>
                <dd class="font-mono">{{ data.appwrite.timeDiffMs === null ? '—' : `${data.appwrite.timeDiffMs} ms` }}</dd>
              </div>
            </dl>

            <div class="mt-2 flex flex-wrap gap-2">
              <UBadge
                v-for="check in data.appwrite.health"
                :key="check.name"
                :color="healthColor[check.status]"
                variant="subtle"
              >
                <UIcon
                  :name="check.status === 'pass' ? 'i-ph-check-circle' : check.status === 'fail' ? 'i-ph-x-circle' : 'i-ph-question'"
                  class="size-3.5"
                />
                {{ check.name }}
                <span v-if="check.ping !== null" class="opacity-70">· {{ check.ping }} ms</span>
              </UBadge>
            </div>
          </UPageCard>

          <!-- Runtime -->
          <UPageCard :title="t('dashboard.system.runtime.title')" :description="t('dashboard.system.runtime.description')" variant="subtle">
            <dl class="w-full text-sm">
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.runtime.node') }}</dt>
                <dd class="font-mono">{{ data.runtime.node }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.runtime.platform') }}</dt>
                <dd class="font-mono">{{ data.runtime.platform }} / {{ data.runtime.arch }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.runtime.uptime') }}</dt>
                <dd class="font-mono">{{ formatUptime(data.runtime.uptimeSeconds) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-4 py-2">
                <dt class="text-muted">{{ t('dashboard.system.runtime.memory') }}</dt>
                <dd class="font-mono">{{ formatBytes(data.runtime.memoryHeapUsedBytes) }} / {{ formatBytes(data.runtime.memoryRssBytes) }}</dd>
              </div>
            </dl>
          </UPageCard>

          <!-- Server -->
          <UPageCard :title="t('dashboard.system.server.title')" :description="t('dashboard.system.server.description')" variant="subtle">
            <dl class="w-full text-sm">
              <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
                <dt class="text-muted">{{ t('dashboard.system.server.hostname') }}</dt>
                <dd class="font-mono break-all">{{ data.server.hostname }}</dd>
              </div>
              <div class="flex items-start justify-between gap-4 py-2">
                <dt class="text-muted">{{ t('dashboard.system.server.ip') }}</dt>
                <dd class="flex flex-wrap justify-end gap-1">
                  <UBadge v-for="ip in data.server.ipAddresses" :key="ip" color="neutral" variant="subtle" class="font-mono">{{ ip }}</UBadge>
                  <span v-if="data.server.ipAddresses.length === 0">—</span>
                </dd>
              </div>
            </dl>
          </UPageCard>

          <!-- Stack: Layers, Modules, Dependencies -->
          <UPageCard :title="t('dashboard.system.stack.title')" :description="t('dashboard.system.stack.description')" variant="subtle">
            <div class="space-y-5">
              <div>
                <p class="mb-2 text-sm font-medium">{{ t('dashboard.system.stack.layers') }}</p>
                <div class="space-y-2">
                  <!--
                    UCollapsible statt handgebauter Aufklapp-Karte (Audit-Befund
                    C12). Kopfzeile, Beschreibung und die Anzahl-Chips liegen
                    bewusst ALLE im Auslöser: die ganze Karte klappt auf, nicht
                    nur die eine Zeile — und die Reihenfolge bleibt exakt die
                    von vorher. Deshalb sind es hier `span`-Elemente: in einem
                    Knopf ist `div`/`p` kein erlaubter Inhalt.
                  -->
                  <UCollapsible
                    v-for="layer in data.layers"
                    :key="layer.name"
                    :open="expandedLayers.has(layer.name)"
                    class="rounded-lg border border-default/60 p-3"
                    @update:open="(value: boolean) => setLayerOpen(layer.name, value)"
                  >
                    <UButton color="neutral" variant="ghost" block :ui="{ base: 'block w-full px-0 py-0 text-left' }">
                      <span class="flex w-full items-center justify-between gap-2">
                        <span class="flex min-w-0 items-center gap-2">
                          <UIcon name="i-ph-stack" class="size-4 shrink-0 text-primary" />
                          <span class="truncate font-mono text-sm font-medium">{{ layer.name }}</span>
                          <UBadge color="neutral" variant="subtle" size="sm" class="font-mono">{{ layer.version }}</UBadge>
                        </span>
                        <span class="flex shrink-0 items-center gap-1.5 text-xs text-dimmed">
                          <span>{{ layer.total }} {{ t('dashboard.system.stack.files') }}</span>
                          <UIcon :name="expandedLayers.has(layer.name) ? 'i-ph-caret-up' : 'i-ph-caret-down'" class="size-3.5" />
                        </span>
                      </span>
                      <span v-if="layer.description" class="mt-1 block text-xs font-normal text-muted">{{ layer.description }}</span>

                      <!-- Eingeklappt: Anzahl-Chips je Kategorie -->
                      <span v-if="!expandedLayers.has(layer.name) && layer.categories.length" class="mt-2 flex flex-wrap gap-1.5">
                        <UBadge v-for="c in layer.categories" :key="c.key" color="neutral" variant="outline" size="sm">
                          <span class="font-mono font-semibold">{{ c.count }}</span>&nbsp;{{ t(`dashboard.system.stack.layerCat.${c.key}`) }}
                        </UBadge>
                      </span>
                    </UButton>

                    <!-- Aufgeklappt: konkrete Namen je Kategorie -->
                    <template #content>
                      <div class="mt-3 space-y-3">
                        <div v-for="c in layer.categories" :key="c.key">
                          <p class="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                            {{ t(`dashboard.system.stack.layerCat.${c.key}`) }}
                            <span class="rounded bg-elevated px-1.5 font-mono text-dimmed">{{ c.count }}</span>
                          </p>
                          <div class="flex flex-wrap gap-1">
                            <span
                              v-for="name in c.items"
                              :key="name"
                              class="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-muted"
                            >{{ name }}</span>
                          </div>
                        </div>
                      </div>
                    </template>
                  </UCollapsible>
                </div>
              </div>

              <div>
                <p class="mb-2 text-sm font-medium">{{ t('dashboard.system.stack.modules') }}</p>
                <div class="flex flex-wrap gap-2">
                  <UBadge v-for="mod in data.modules" :key="mod" color="neutral" variant="subtle" class="font-mono">{{ mod }}</UBadge>
                </div>
              </div>

              <div>
                <div class="mb-2 flex items-center gap-2">
                  <p class="text-sm font-medium">{{ t('dashboard.system.stack.dependencies') }}</p>
                  <UBadge v-if="outdatedCount > 0" color="warning" variant="subtle" size="sm">
                    <UIcon name="i-ph-arrow-circle-up" class="size-3.5" />
                    {{ t('dashboard.system.stack.outdated', { count: outdatedCount }) }}
                  </UBadge>
                  <UBadge v-else-if="checkedCount > 0" color="success" variant="subtle" size="sm">
                    <UIcon name="i-ph-check-circle" class="size-3.5" />
                    {{ t('dashboard.system.stack.allCurrent') }}
                  </UBadge>
                </div>
                <UAlert
                  v-if="justUpdated.size"
                  color="info"
                  variant="subtle"
                  icon="i-ph-arrows-clockwise"
                  :title="t('dashboard.system.stack.restartTitle')"
                  :description="t('dashboard.system.stack.restartHint')"
                  class="mb-3"
                />
                <!--
                  Abhängigkeiten als UTable (B6) — eine Tabelle JE KATEGORIE,
                  damit die Gruppierung bleibt, die es vorher schon gab
                  (Kategorie-Zeile, darunter die Pakete). Der Inhalt ist
                  unverändert: Paketname links, Version/Sprung/Update-Knopf
                  rechts, `min-w-0` am Gefäß wie überall, wo eine Tabelle in
                  einer Karte steht.
                -->
                <div class="min-w-0 space-y-3">
                  <div v-for="group in groupedDependencies" :key="group.category">
                    <p class="text-xs uppercase tracking-wide text-dimmed">{{ group.category }}</p>
                    <UTable :data="group.items" :columns="dependencyColumns" :data-dependency-group="group.category">
                      <template #name-cell="{ row }">
                        <span class="font-mono text-sm">{{ row.original.name }}</span>
                      </template>
                      <template #version-cell="{ row }">
                        <div class="flex items-center justify-end gap-1.5 font-mono text-sm">
                          <UBadge v-if="justUpdated.has(row.original.name)" color="info" variant="subtle" size="sm" class="font-sans">
                            <UIcon name="i-ph-arrows-clockwise" class="size-3.5" />
                            {{ t('dashboard.system.stack.restartNeeded') }}
                          </UBadge>
                          <template v-else>
                            <span :class="row.original.outdated ? 'text-warning' : 'text-muted'">{{ row.original.version }}</span>
                            <template v-if="row.original.outdated">
                              <UIcon name="i-ph-arrow-right" class="size-3 text-dimmed" />
                              <span class="font-medium text-warning">{{ row.original.latest }}</span>
                              <UButton
                                v-if="isDev"
                                size="xs"
                                color="warning"
                                variant="soft"
                                icon="i-ph-arrow-circle-up"
                                class="ms-1 font-sans"
                                @click="updateDep(row.original)"
                              >
                                {{ t('dashboard.system.stack.update') }}
                              </UButton>
                            </template>
                            <UTooltip v-else-if="row.original.outdated === false" :text="t('dashboard.system.stack.current')">
                              <UIcon name="i-ph-check-circle" class="size-4 text-success" />
                            </UTooltip>
                          </template>
                        </div>
                      </template>
                    </UTable>
                  </div>
                </div>
              </div>
            </div>
          </UPageCard>

          <p class="text-center text-xs text-dimmed">
            {{ t('dashboard.system.generatedAt', { time: generatedAtLabel }) }}
          </p>
          </template>
        </ClientOnly>
      </div>

    </template>
  </UDashboardPanel>
</template>

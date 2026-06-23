<script setup lang="ts">
import type { SystemInfo } from '../../../shared/types/system'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t, locale } = useI18n()
const toast = useToast()
const isDev = import.meta.dev

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

const outdatedCount = computed(() => (data.value?.dependencies ?? []).filter(d => d.outdated === true).length)
const checkedCount = computed(() => (data.value?.dependencies ?? []).filter(d => d.outdated !== null && d.outdated !== undefined).length)

// --- Dev-only: Dependency-Update (Catalog-Bump + pnpm install) ----------------
type Dep = SystemInfo['dependencies'][number]
const pendingUpdate = ref<Dep | null>(null)
const updating = ref(false)
const justUpdated = ref(new Set<string>())

async function confirmUpdate() {
  const dep = pendingUpdate.value
  if (!dep) return
  updating.value = true
  try {
    const res = await $fetch<{ to: string }>('/api/admin/system/update', { method: 'POST', body: { name: dep.name } })
    justUpdated.value = new Set(justUpdated.value).add(dep.name)
    toast.add({ title: t('dashboard.system.stack.updateStarted', { name: dep.name, version: res.to }), color: 'success', duration: 8000 })
    pendingUpdate.value = null
  }
  catch (error) {
    const detail = (error as { statusMessage?: string, data?: { statusMessage?: string } })
    toast.add({
      title: t('dashboard.system.stack.updateFailed'),
      description: detail.data?.statusMessage ?? detail.statusMessage,
      color: 'error',
    })
  }
  finally {
    updating.value = false
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
                <div class="flex flex-wrap gap-2">
                  <UBadge v-for="layer in data.layers" :key="layer.name" color="primary" variant="subtle">
                    {{ layer.name }} <span class="font-mono opacity-70">{{ layer.version }}</span>
                  </UBadge>
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
                <div class="space-y-3">
                  <div v-for="group in groupedDependencies" :key="group.category">
                    <p class="text-xs uppercase tracking-wide text-dimmed">{{ group.category }}</p>
                    <dl class="text-sm">
                      <div
                        v-for="dep in group.items"
                        :key="dep.name"
                        class="flex items-center justify-between gap-4 border-b border-default/60 py-1.5 last:border-0"
                      >
                        <dt class="font-mono">{{ dep.name }}</dt>
                        <dd class="flex items-center gap-1.5 font-mono">
                          <UBadge v-if="justUpdated.has(dep.name)" color="info" variant="subtle" size="sm" class="font-sans">
                            <UIcon name="i-ph-arrows-clockwise" class="size-3.5" />
                            {{ t('dashboard.system.stack.restartNeeded') }}
                          </UBadge>
                          <template v-else>
                            <span :class="dep.outdated ? 'text-warning' : 'text-muted'">{{ dep.version }}</span>
                            <template v-if="dep.outdated">
                              <UIcon name="i-ph-arrow-right" class="size-3 text-dimmed" />
                              <span class="font-medium text-warning">{{ dep.latest }}</span>
                              <UButton
                                v-if="isDev"
                                size="xs"
                                color="warning"
                                variant="soft"
                                icon="i-ph-arrow-circle-up"
                                class="ms-1 font-sans"
                                @click="pendingUpdate = dep"
                              >
                                {{ t('dashboard.system.stack.update') }}
                              </UButton>
                            </template>
                            <UTooltip v-else-if="dep.outdated === false" :text="t('dashboard.system.stack.current')">
                              <UIcon name="i-ph-check-circle" class="size-4 text-success" />
                            </UTooltip>
                          </template>
                        </dd>
                      </div>
                    </dl>
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

      <UModal
        :open="pendingUpdate !== null"
        :title="t('dashboard.system.stack.updateTitle')"
        @update:open="(v: boolean) => { if (!v) pendingUpdate = null }"
      >
        <template #body>
          <p class="text-sm">
            {{ t('dashboard.system.stack.updateConfirm', { name: pendingUpdate?.name, from: pendingUpdate?.version, to: pendingUpdate?.latest }) }}
          </p>
          <p class="mt-2 text-xs text-muted">{{ t('dashboard.system.stack.updateNote') }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="updating" @click="pendingUpdate = null">{{ t('comments.item.cancel') }}</UButton>
            <UButton color="warning" icon="i-ph-arrow-circle-up" :loading="updating" @click="confirmUpdate">{{ t('dashboard.system.stack.updateConfirmBtn') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

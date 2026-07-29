<script setup lang="ts">
// Sites-Register (Control Plane, M6-T1) + Site-Erstellungs-Flow (M6-T2):
// Übersicht aller Sites mit Lifecycle-Status + Health, manuelle Registrierung
// bestehender Sites und „Neue Site" als Provisionierungs-Job — ausgeführt
// repo-seitig von `pnpm control:jobs` (§ 8: der Web-Prozess beschreibt nur).
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { SiteRow } from '../../../shared/types/site'
import type { FeatureCatalogEntry, JobRow, SiteCreateJobPayload, SiteCreateJobResult } from '../../../shared/types/job'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

type SiteWithEntitlements = SiteRow & { entitlements: string[] }
const { data, refresh } = await useFetch<{ sites: SiteWithEntitlements[] }>('/api/control/sites')
const { data: jobsData, refresh: refreshJobs } = await useFetch<{ jobs: JobRow[] }>('/api/control/jobs')
const { data: catalogData } = await useFetch<{ features: FeatureCatalogEntry[] }>('/api/control/features')
const { data: workspacesData } = await useFetch<{ workspaces: { $id: string, name: string }[] }>('/api/control/workspaces')

// ── Workspace-Zuordnung (M8-T2) ─────────────────────────────────────────────
// Sentinel statt '': Reka-SelectItem verbietet Leerstrings als value
const NO_WORKSPACE = 'operator'
const workspaceOptions = computed(() => [
  { label: t('control.workspaces.operator'), value: NO_WORKSPACE },
  ...(workspacesData.value?.workspaces ?? []).map(w => ({ label: w.name, value: w.$id })),
])

async function assignWorkspace(site: SiteRow, value: string) {
  const workspaceId = value === NO_WORKSPACE ? '' : value
  if (workspaceId === (site.workspaceId ?? '')) return
  try {
    await $fetch(`/api/control/sites/${site.$id}`, { method: 'PATCH', body: { workspaceId } })
    toast.add({ title: t('control.workspaces.assigned', { name: site.name }), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('control.workspaces.assignFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  await refresh()
}

// ── Manuelle Registrierung (T1) ─────────────────────────────────────────────
const showRegister = ref(false)
const form = reactive({ name: '', slug: '', projectId: '', endpoint: 'http://localhost/v1', appUrl: '' })

async function register() {
  try {
    await $fetch('/api/control/sites', { method: 'POST', body: { ...form, appUrl: form.appUrl || undefined } })
    toast.add({ title: t('control.sites.registered', { name: form.name }), color: 'success' })
    showRegister.value = false
    Object.assign(form, { name: '', slug: '', projectId: '', endpoint: 'http://localhost/v1', appUrl: '' })
  }
  catch (error) {
    toast.add({ title: t('control.sites.registerFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  await refresh()
}

const checking = ref<string | null>(null)
async function checkHealth(site: SiteRow) {
  checking.value = site.$id
  try {
    await $fetch(`/api/control/sites/${site.$id}/health`, { method: 'POST' })
  }
  catch {
    toast.add({ title: t('control.sites.healthFailed'), color: 'error' })
  }
  finally {
    checking.value = null
    await refresh()
  }
}

async function deregister(site: SiteRow) {
  try {
    const ok = await confirm({
      title: t('control.sites.deregisterTitle'),
      description: t('control.sites.deregisterConfirm', { name: site.name }),
      confirmLabel: t('control.sites.deregister'),
      action: () => $fetch(`/api/control/sites/${site.$id}`, { method: 'DELETE' }),
    })
    if (!ok) return
  }
  catch {
    toast.add({ title: t('control.sites.deregisterFailed'), color: 'error' })
  }
  await refresh()
}

// ── Neue Site (T2): create-site als Job ─────────────────────────────────────
const DEFAULT_FEATURES = ['themes', 'admin', 'comments', 'moderation']
const showCreate = ref(false)
const createName = ref('')
const selected = ref<string[]>([...DEFAULT_FEATURES])
const creating = ref(false)

/** Wählbar: alles außer core/system (implizit) und studio (nur Control-Site). */
const selectableFeatures = computed(() =>
  (catalogData.value?.features ?? [])
    .filter(f => !['core', 'system', 'control'].includes(f.key))
    .sort((a, b) => (a.tier === b.tier ? a.key.localeCompare(b.key) : a.tier === 'foundation' ? -1 : 1)))
const text = (value: { en: string, de: string }) => (locale.value.startsWith('de') ? value.de : value.en)

function toggleIn(list: Ref<string[]>, key: string, on: boolean) {
  const catalog = selectableFeatures.value
  if (on) {
    // requires-Schluss: Abhängigkeiten automatisch mit auswählen
    const add = (k: string) => {
      if (list.value.includes(k)) return
      list.value.push(k)
      for (const req of catalog.find(f => f.key === k)?.requires ?? []) add(req)
    }
    add(key)
  }
  else {
    // Abwahl nimmt Features mit, die dieses voraussetzen
    list.value = list.value.filter(k =>
      k !== key && !(catalog.find(f => f.key === k)?.requires ?? []).includes(key))
  }
}
const toggleFeature = (key: string, on: boolean) => toggleIn(selected, key, on)

async function createSite() {
  creating.value = true
  try {
    await $fetch('/api/control/jobs', {
      method: 'POST',
      body: { type: 'site.create', name: createName.value.trim(), features: selected.value },
    })
    toast.add({ title: t('control.jobs.created', { name: createName.value.trim() }), color: 'success' })
    showCreate.value = false
    createName.value = ''
    selected.value = [...DEFAULT_FEATURES]
  }
  catch (error) {
    toast.add({ title: t('control.jobs.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    creating.value = false
  }
  await refreshJobs()
}

// ── Entitlements (T3): Grant-Set je Site verwalten ──────────────────────────
const entitlementSite = ref<SiteWithEntitlements | null>(null)
const grantSelection = ref<string[]>([])
const savingGrants = ref(false)

function openEntitlements(site: SiteWithEntitlements) {
  entitlementSite.value = site
  grantSelection.value = [...site.entitlements]
}
const toggleGrant = (key: string, on: boolean) => toggleIn(grantSelection, key, on)

async function saveEntitlements() {
  if (!entitlementSite.value) return
  savingGrants.value = true
  try {
    await $fetch(`/api/control/sites/${entitlementSite.value.$id}/entitlements`, {
      method: 'PUT',
      body: { features: grantSelection.value },
    })
    toast.add({ title: t('control.entitlements.saved', { name: entitlementSite.value.name }), color: 'success' })
    entitlementSite.value = null
  }
  catch (error) {
    toast.add({ title: t('control.entitlements.saveFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    savingGrants.value = false
  }
  await refresh()
}

// ── Jobs-Liste + Polling, solange Jobs offen sind ───────────────────────────
const jobPayload = (job: JobRow) => JSON.parse(job.payload || '{}') as SiteCreateJobPayload
const jobResult = (job: JobRow) => (job.result ? JSON.parse(job.result) as SiteCreateJobResult : null)
const hasOpenJobs = computed(() => (jobsData.value?.jobs ?? []).some(j => j.status === 'queued' || j.status === 'running'))
const expandedLog = ref<string | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  pollTimer = setInterval(async () => {
    if (!hasOpenJobs.value) return
    await refreshJobs()
    if (!hasOpenJobs.value) await refresh() // Job fertig → Register neu laden
  }, 3000)
})
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })

/** Feature-Snapshot der Site (vom Health-Sweep, T4) — implizite Keys werden
 *  nicht angezeigt; läuft etwas ohne Entitlement, warnt der Chip. */
const IMPLICIT_FEATURES = ['core', 'system', 'control']
function runningFeatures(site: SiteWithEntitlements): string[] {
  try {
    return (JSON.parse(site.features || '[]') as string[]).filter(key => !IMPLICIT_FEATURES.includes(key))
  }
  catch {
    return []
  }
}

const healthColor = (s: string) => (s === 'ok' ? 'success' : s === 'degraded' ? 'warning' : s === 'down' ? 'error' : 'neutral') as 'success' | 'warning' | 'error' | 'neutral'
const statusColor = (s: string) => (s === 'active' ? 'success' : s === 'provisioning' ? 'info' : s === 'error' || s === 'deletion_failed' ? 'error' : 'warning') as 'success' | 'info' | 'error' | 'warning'
const jobColor = (s: string) => (s === 'done' ? 'success' : s === 'running' ? 'info' : s === 'error' ? 'error' : 'neutral') as 'success' | 'info' | 'error' | 'neutral'

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const siteColumns = computed<TableColumn<SiteWithEntitlements>[]>(() => [
  { accessorKey: 'name', header: () => t('control.sites.col.site') },
  { id: 'state', header: () => t('control.sites.col.state') },
  { id: 'features', header: () => t('control.sites.col.features'), meta: { class: HIDE_LG } },
  { id: 'workspace', header: () => t('control.sites.col.workspace'), meta: { class: HIDE_MD } },
  { id: 'actions', header: () => '' },
])

const jobColumns = computed<TableColumn<JobRow>[]>(() => [
  { id: 'job', header: () => t('control.jobs.col.job') },
  { id: 'jobFeatures', header: () => t('control.jobs.col.features'), meta: { class: HIDE_MD } },
  { accessorKey: 'status', header: () => t('control.jobs.col.status') },
  { id: 'jobActions', header: () => '' },
])

function siteActions(site: SiteWithEntitlements): DropdownMenuItem[][] {
  return [
    [
      { label: t('control.entitlements.manage'), icon: 'i-ph-stack', onSelect: () => openEntitlements(site) },
      { label: t('control.sites.check'), icon: 'i-ph-heartbeat', onSelect: () => { void checkHealth(site) } },
    ],
    [{ label: t('control.sites.deregister'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void deregister(site) } }],
  ]
}
</script>

<template>
  <UDashboardPanel id="sites">
    <template #header>
      <UDashboardNavbar :title="t('control.sites.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" color="neutral" variant="outline" data-sites-register @click="() => { showRegister = true }">
            {{ t('control.sites.register') }}
          </UButton>
          <UButton icon="i-ph-rocket-launch" data-sites-create @click="() => { showCreate = true }">
            {{ t('control.jobs.newSite') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable :data="data?.sites ?? []" :columns="siteColumns" data-sites-list>
        <template #name-cell="{ row }">
          <div class="min-w-0" :data-site="row.original.slug">
            <p class="font-medium">{{ row.original.name }}</p>
            <p class="truncate text-xs text-muted">
              {{ row.original.projectId }} · {{ row.original.endpoint }}
              <template v-if="row.original.appUrl"> · <a :href="row.original.appUrl" target="_blank" rel="noopener" class="underline">{{ row.original.appUrl }}</a></template>
            </p>
          </div>
        </template>
        <template #state-cell="{ row }">
          <div class="flex flex-wrap items-center gap-1">
            <UBadge :color="statusColor(row.original.status)" variant="subtle" size="sm">{{ row.original.status }}</UBadge>
            <UBadge :color="healthColor(row.original.healthStatus)" variant="subtle" size="sm" :data-site-health="row.original.healthStatus">
              {{ row.original.healthStatus }}
            </UBadge>
            <!-- ClientOnly: toLocaleString weicht zwischen Node-SSR und Browser ab (Hydration) -->
            <ClientOnly>
              <p v-if="row.original.healthCheckedAt" class="w-full text-xs text-muted">
                {{ t('control.sites.lastCheck', { at: new Date(row.original.healthCheckedAt).toLocaleString() }) }}
              </p>
            </ClientOnly>
          </div>
        </template>
        <template #features-cell="{ row }">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-1" :data-site-entitlements="row.original.entitlements.join(',')">
              <template v-if="row.original.entitlements.length">
                <UBadge v-for="feature in row.original.entitlements" :key="feature" color="neutral" variant="outline" size="sm">{{ feature }}</UBadge>
              </template>
              <span v-else class="text-xs text-muted">{{ t('control.entitlements.none') }}</span>
            </div>
            <div v-if="runningFeatures(row.original).length" class="flex flex-wrap items-center gap-1" :data-site-running="runningFeatures(row.original).join(',')">
              <span class="text-xs text-muted">{{ t('control.sites.running') }}</span>
              <UBadge
                v-for="feature in runningFeatures(row.original)"
                :key="feature"
                :color="row.original.entitlements.includes(feature) ? 'neutral' : 'warning'"
                variant="subtle"
                size="sm"
                :title="row.original.entitlements.includes(feature) ? undefined : t('control.sites.runningUnentitled')"
              >
                {{ feature }}
              </UBadge>
            </div>
          </div>
        </template>
        <template #workspace-cell="{ row }">
          <USelect
            :model-value="row.original.workspaceId || NO_WORKSPACE"
            :items="workspaceOptions"
            size="sm"
            class="w-40"
            :ui="{ content: 'min-w-fit' }"
            :aria-label="t('control.workspaces.assignLabel')"
            :data-site-workspace="row.original.slug"
            @update:model-value="assignWorkspace(row.original, $event as string)"
          />
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="siteActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('control.sites.rowActions')"
                :loading="checking === row.original.$id"
                :data-site-check="row.original.slug"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-globe"
            :title="t('control.sites.emptyTitle')"
            :description="t('control.sites.empty')"
            :action-label="t('control.jobs.newSite')"
            action-icon="i-ph-rocket-launch"
            data-sites-empty
            @action="() => { showCreate = true }"
          />
        </template>
      </UTable>

      <!-- Provisionierungs-Jobs (T2) -->
      <template v-if="jobsData?.jobs.length">
        <h2 class="mt-10 mb-2 text-sm font-semibold text-highlighted">{{ t('control.jobs.title') }}</h2>
        <UTable :data="jobsData.jobs" :columns="jobColumns" data-jobs-list>
          <template #job-cell="{ row }">
            <div class="min-w-0" :data-job="jobPayload(row.original).name">
              <p class="font-medium">{{ jobPayload(row.original).name }}</p>
              <p class="text-xs text-muted">
                <ClientOnly>{{ new Date(row.original.$createdAt).toLocaleString() }}</ClientOnly>
                <template v-if="jobResult(row.original)?.projectId"> · {{ jobResult(row.original)!.projectId }}</template>
                <template v-if="jobResult(row.original)?.appUrl"> · <a :href="jobResult(row.original)!.appUrl" target="_blank" rel="noopener" class="underline">{{ jobResult(row.original)!.appUrl }}</a></template>
              </p>
              <pre v-if="expandedLog === row.original.$id" class="mt-2 max-h-64 overflow-auto rounded bg-elevated p-3 text-xs whitespace-pre-wrap" data-job-log>{{ row.original.log }}</pre>
            </div>
          </template>
          <template #jobFeatures-cell="{ row }">
            <span class="text-xs text-muted">{{ (jobPayload(row.original).features ?? []).join(', ') }}</span>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="jobColor(row.original.status)" variant="subtle" size="sm" :data-job-status="row.original.status">{{ row.original.status }}</UBadge>
          </template>
          <template #jobActions-cell="{ row }">
            <div class="flex justify-end">
              <UButton
                v-if="row.original.log"
                size="xs"
                color="neutral"
                variant="ghost"
                :icon="expandedLog === row.original.$id ? 'i-ph-caret-up' : 'i-ph-caret-down'"
                @click="() => { expandedLog = expandedLog === row.original.$id ? null : row.original.$id }"
              >
                {{ t('control.jobs.log') }}
              </UButton>
            </div>
          </template>
        </UTable>
      </template>

      <!-- T1: bestehende Site manuell registrieren -->
      <UModal :open="showRegister" :title="t('control.sites.registerTitle')" @update:open="() => { showRegister = false }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('control.sites.fieldName')"><UInput v-model="form.name" class="w-full" /></UFormField>
            <UFormField :label="t('control.sites.fieldSlug')"><UInput v-model="form.slug" class="w-full" placeholder="photos" /></UFormField>
            <UFormField :label="t('control.sites.fieldProjectId')" :hint="t('control.sites.fieldProjectIdHint')"><UInput v-model="form.projectId" class="w-full" placeholder="photos-qgry" /></UFormField>
            <UFormField :label="t('control.sites.fieldEndpoint')"><UInput v-model="form.endpoint" class="w-full" /></UFormField>
            <UFormField :label="t('control.sites.fieldAppUrl')"><UInput v-model="form.appUrl" class="w-full" placeholder="http://localhost:3003" /></UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { showRegister = false }">{{ t('control.sites.cancel') }}</UButton>
            <UButton data-sites-save @click="register">{{ t('control.sites.save') }}</UButton>
          </div>
        </template>
      </UModal>

      <!-- T3: Entitlements einer Site verwalten -->
      <UModal :open="!!entitlementSite" :title="t('control.entitlements.title', { name: entitlementSite?.name ?? '' })" @update:open="() => { entitlementSite = null }">
        <template #body>
          <UFormField :label="t('control.jobs.fieldFeatures')" :help="t('control.entitlements.help')">
            <p v-if="!selectableFeatures.length" class="text-sm text-muted">{{ t('control.jobs.catalogEmpty') }}</p>
            <div v-else class="max-h-72 space-y-2 overflow-y-auto pr-1">
              <UCheckbox
                v-for="feature in selectableFeatures"
                :key="feature.key"
                :model-value="grantSelection.includes(feature.key)"
                :label="text(feature.title)"
                :description="text(feature.description)"
                :data-grant-feature="feature.key"
                @update:model-value="toggleGrant(feature.key, $event === true)"
              />
            </div>
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { entitlementSite = null }">{{ t('control.sites.cancel') }}</UButton>
            <UButton :loading="savingGrants" :disabled="!selectableFeatures.length" data-grant-save @click="saveEntitlements">
              {{ t('control.entitlements.save') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- T2: neue Site als Provisionierungs-Job -->
      <UModal :open="showCreate" :title="t('control.jobs.newSiteTitle')" @update:open="() => { showCreate = false }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('control.jobs.fieldName')" :hint="t('control.jobs.fieldNameHint')">
              <UInput v-model="createName" class="w-full" placeholder="portfolio" data-create-name />
            </UFormField>
            <UFormField :label="t('control.jobs.fieldFeatures')" :help="t('control.jobs.fieldFeaturesHelp')">
              <p v-if="!selectableFeatures.length" class="text-sm text-muted">{{ t('control.jobs.catalogEmpty') }}</p>
              <div v-else class="max-h-72 space-y-2 overflow-y-auto pr-1">
                <UCheckbox
                  v-for="feature in selectableFeatures"
                  :key="feature.key"
                  :model-value="selected.includes(feature.key)"
                  :label="text(feature.title)"
                  :description="text(feature.description)"
                  :data-create-feature="feature.key"
                  @update:model-value="toggleFeature(feature.key, $event === true)"
                />
              </div>
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full items-center justify-between gap-2">
            <p class="text-xs text-muted">{{ t('control.jobs.runnerHint') }}</p>
            <div class="flex gap-2">
              <UButton color="neutral" variant="ghost" @click="() => { showCreate = false }">{{ t('control.sites.cancel') }}</UButton>
              <UButton :disabled="!createName.trim() || !selectableFeatures.length" :loading="creating" data-create-save @click="createSite">
                {{ t('control.jobs.create') }}
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

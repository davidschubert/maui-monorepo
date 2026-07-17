<script setup lang="ts">
// Sites-Register (Control Plane, M6-T1) + Site-Erstellungs-Flow (M6-T2):
// Übersicht aller Sites mit Lifecycle-Status + Health, manuelle Registrierung
// bestehender Sites und „Neue Site" als Provisionierungs-Job — ausgeführt
// repo-seitig von `pnpm studio:jobs` (§ 8: der Web-Prozess beschreibt nur).
import type { SiteRow } from '../../../shared/types/site'
import type { FeatureCatalogEntry, JobRow, SiteCreateJobPayload, SiteCreateJobResult } from '../../../shared/types/job'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t, locale } = useI18n()
const toast = useToast()

type SiteWithEntitlements = SiteRow & { entitlements: string[] }
const { data, refresh } = await useFetch<{ sites: SiteWithEntitlements[] }>('/api/studio/sites')
const { data: jobsData, refresh: refreshJobs } = await useFetch<{ jobs: JobRow[] }>('/api/studio/jobs')
const { data: catalogData } = await useFetch<{ features: FeatureCatalogEntry[] }>('/api/studio/features')

// ── Manuelle Registrierung (T1) ─────────────────────────────────────────────
const showRegister = ref(false)
const form = reactive({ name: '', slug: '', projectId: '', endpoint: 'http://localhost/v1', appUrl: '' })

async function register() {
  try {
    await $fetch('/api/studio/sites', { method: 'POST', body: { ...form, appUrl: form.appUrl || undefined } })
    toast.add({ title: t('studio.sites.registered', { name: form.name }), color: 'success' })
    showRegister.value = false
    Object.assign(form, { name: '', slug: '', projectId: '', endpoint: 'http://localhost/v1', appUrl: '' })
  }
  catch (error) {
    toast.add({ title: t('studio.sites.registerFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  await refresh()
}

const checking = ref<string | null>(null)
async function checkHealth(site: SiteRow) {
  checking.value = site.$id
  try {
    await $fetch(`/api/studio/sites/${site.$id}/health`, { method: 'POST' })
  }
  catch {
    toast.add({ title: t('studio.sites.healthFailed'), color: 'error' })
  }
  finally {
    checking.value = null
    await refresh()
  }
}

async function deregister(site: SiteRow) {
  if (!confirm(t('studio.sites.deregisterConfirm', { name: site.name }))) return
  await $fetch(`/api/studio/sites/${site.$id}`, { method: 'DELETE' }).catch(() => {
    toast.add({ title: t('studio.sites.deregisterFailed'), color: 'error' })
  })
  await refresh()
}

// ── Neue Site (T2): create-site als Job ─────────────────────────────────────
const DEFAULT_FEATURES = ['themes', 'admin', 'comments', 'moderation']
const showCreate = ref(false)
const createName = ref('')
const selected = ref<string[]>([...DEFAULT_FEATURES])
const creating = ref(false)

/** Wählbar: alles außer core/system (implizit) und studio (nur Studio-Site). */
const selectableFeatures = computed(() =>
  (catalogData.value?.features ?? [])
    .filter(f => !['core', 'system', 'studio'].includes(f.key))
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
    await $fetch('/api/studio/jobs', {
      method: 'POST',
      body: { type: 'site.create', name: createName.value.trim(), features: selected.value },
    })
    toast.add({ title: t('studio.jobs.created', { name: createName.value.trim() }), color: 'success' })
    showCreate.value = false
    createName.value = ''
    selected.value = [...DEFAULT_FEATURES]
  }
  catch (error) {
    toast.add({ title: t('studio.jobs.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
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
    await $fetch(`/api/studio/sites/${entitlementSite.value.$id}/entitlements`, {
      method: 'PUT',
      body: { features: grantSelection.value },
    })
    toast.add({ title: t('studio.entitlements.saved', { name: entitlementSite.value.name }), color: 'success' })
    entitlementSite.value = null
  }
  catch (error) {
    toast.add({ title: t('studio.entitlements.saveFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
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
const IMPLICIT_FEATURES = ['core', 'system', 'studio']
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
</script>

<template>
  <UDashboardPanel id="sites">
    <template #header>
      <UDashboardNavbar :title="t('studio.sites.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" color="neutral" variant="outline" data-sites-register @click="showRegister = true">
            {{ t('studio.sites.register') }}
          </UButton>
          <UButton icon="i-ph-rocket-launch" data-sites-create @click="showCreate = true">
            {{ t('studio.jobs.newSite') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p v-if="!data?.sites.length" class="py-12 text-center text-sm text-muted" data-sites-empty>
        {{ t('studio.sites.empty') }}
      </p>

      <div v-else class="divide-y divide-default" data-sites-list>
        <div v-for="site in data.sites" :key="site.$id" class="flex flex-wrap items-center justify-between gap-3 py-4" :data-site="site.slug">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ site.name }}</p>
              <UBadge :color="statusColor(site.status)" variant="subtle" size="sm">{{ site.status }}</UBadge>
              <UBadge :color="healthColor(site.healthStatus)" variant="subtle" size="sm" :data-site-health="site.healthStatus">
                {{ site.healthStatus }}
              </UBadge>
            </div>
            <p class="mt-0.5 truncate text-sm text-muted">
              {{ site.projectId }} · {{ site.endpoint }}
              <template v-if="site.appUrl"> · <a :href="site.appUrl" target="_blank" rel="noopener" class="underline">{{ site.appUrl }}</a></template>
            </p>
            <!-- ClientOnly: toLocaleString weicht zwischen Node-SSR und Browser ab (Hydration) -->
            <ClientOnly>
              <p v-if="site.healthCheckedAt" class="text-xs text-muted">
                {{ t('studio.sites.lastCheck', { at: new Date(site.healthCheckedAt).toLocaleString() }) }}
              </p>
            </ClientOnly>
            <div class="mt-1 flex flex-wrap items-center gap-1" :data-site-entitlements="site.entitlements.join(',')">
              <template v-if="site.entitlements.length">
                <UBadge v-for="feature in site.entitlements" :key="feature" color="neutral" variant="outline" size="sm">{{ feature }}</UBadge>
              </template>
              <span v-else class="text-xs text-muted">{{ t('studio.entitlements.none') }}</span>
            </div>
            <div v-if="runningFeatures(site).length" class="mt-1 flex flex-wrap items-center gap-1" :data-site-running="runningFeatures(site).join(',')">
              <span class="text-xs text-muted">{{ t('studio.sites.running') }}</span>
              <UBadge
                v-for="feature in runningFeatures(site)"
                :key="feature"
                :color="site.entitlements.includes(feature) ? 'neutral' : 'warning'"
                variant="subtle"
                size="sm"
                :title="site.entitlements.includes(feature) ? undefined : t('studio.sites.runningUnentitled')"
              >
                {{ feature }}
              </UBadge>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <UButton icon="i-ph-stack" size="sm" color="neutral" variant="ghost" :data-site-entitle="site.slug" @click="openEntitlements(site)">
              {{ t('studio.entitlements.manage') }}
            </UButton>
            <UButton icon="i-ph-heartbeat" size="sm" color="neutral" variant="ghost" :loading="checking === site.$id" :data-site-check="site.slug" @click="checkHealth(site)">
              {{ t('studio.sites.check') }}
            </UButton>
            <UButton icon="i-ph-trash" size="sm" color="error" variant="ghost" :aria-label="t('studio.sites.deregister')" @click="deregister(site)" />
          </div>
        </div>
      </div>

      <!-- Provisionierungs-Jobs (T2) -->
      <template v-if="jobsData?.jobs.length">
        <h2 class="mt-10 mb-2 text-sm font-semibold text-highlighted">{{ t('studio.jobs.title') }}</h2>
        <div class="divide-y divide-default" data-jobs-list>
          <div v-for="job in jobsData.jobs" :key="job.$id" class="py-3" :data-job="jobPayload(job).name">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium">{{ jobPayload(job).name }}</p>
                <UBadge :color="jobColor(job.status)" variant="subtle" size="sm" :data-job-status="job.status">{{ job.status }}</UBadge>
                <span class="text-xs text-muted">{{ (jobPayload(job).features ?? []).join(', ') }}</span>
              </div>
              <UButton v-if="job.log" size="xs" color="neutral" variant="ghost" :icon="expandedLog === job.$id ? 'i-ph-caret-up' : 'i-ph-caret-down'" @click="expandedLog = expandedLog === job.$id ? null : job.$id">
                {{ t('studio.jobs.log') }}
              </UButton>
            </div>
            <p class="mt-0.5 text-xs text-muted">
              <ClientOnly>{{ new Date(job.$createdAt).toLocaleString() }}</ClientOnly>
              <template v-if="jobResult(job)?.projectId"> · {{ jobResult(job)!.projectId }}</template>
              <template v-if="jobResult(job)?.appUrl"> · <a :href="jobResult(job)!.appUrl" target="_blank" rel="noopener" class="underline">{{ jobResult(job)!.appUrl }}</a></template>
            </p>
            <pre v-if="expandedLog === job.$id" class="mt-2 max-h-64 overflow-auto rounded bg-elevated p-3 text-xs whitespace-pre-wrap" data-job-log>{{ job.log }}</pre>
          </div>
        </div>
      </template>

      <!-- T1: bestehende Site manuell registrieren -->
      <UModal :open="showRegister" :title="t('studio.sites.registerTitle')" @update:open="showRegister = false">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('studio.sites.fieldName')"><UInput v-model="form.name" class="w-full" /></UFormField>
            <UFormField :label="t('studio.sites.fieldSlug')"><UInput v-model="form.slug" class="w-full" placeholder="photos" /></UFormField>
            <UFormField :label="t('studio.sites.fieldProjectId')" :hint="t('studio.sites.fieldProjectIdHint')"><UInput v-model="form.projectId" class="w-full" placeholder="photos-qgry" /></UFormField>
            <UFormField :label="t('studio.sites.fieldEndpoint')"><UInput v-model="form.endpoint" class="w-full" /></UFormField>
            <UFormField :label="t('studio.sites.fieldAppUrl')"><UInput v-model="form.appUrl" class="w-full" placeholder="http://localhost:3003" /></UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showRegister = false">{{ t('studio.sites.cancel') }}</UButton>
            <UButton data-sites-save @click="register">{{ t('studio.sites.save') }}</UButton>
          </div>
        </template>
      </UModal>

      <!-- T3: Entitlements einer Site verwalten -->
      <UModal :open="!!entitlementSite" :title="t('studio.entitlements.title', { name: entitlementSite?.name ?? '' })" @update:open="entitlementSite = null">
        <template #body>
          <UFormField :label="t('studio.jobs.fieldFeatures')" :help="t('studio.entitlements.help')">
            <p v-if="!selectableFeatures.length" class="text-sm text-muted">{{ t('studio.jobs.catalogEmpty') }}</p>
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
            <UButton color="neutral" variant="ghost" @click="entitlementSite = null">{{ t('studio.sites.cancel') }}</UButton>
            <UButton :loading="savingGrants" :disabled="!selectableFeatures.length" data-grant-save @click="saveEntitlements">
              {{ t('studio.entitlements.save') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- T2: neue Site als Provisionierungs-Job -->
      <UModal :open="showCreate" :title="t('studio.jobs.newSiteTitle')" @update:open="showCreate = false">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('studio.jobs.fieldName')" :hint="t('studio.jobs.fieldNameHint')">
              <UInput v-model="createName" class="w-full" placeholder="portfolio" data-create-name />
            </UFormField>
            <UFormField :label="t('studio.jobs.fieldFeatures')" :help="t('studio.jobs.fieldFeaturesHelp')">
              <p v-if="!selectableFeatures.length" class="text-sm text-muted">{{ t('studio.jobs.catalogEmpty') }}</p>
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
            <p class="text-xs text-muted">{{ t('studio.jobs.runnerHint') }}</p>
            <div class="flex gap-2">
              <UButton color="neutral" variant="ghost" @click="showCreate = false">{{ t('studio.sites.cancel') }}</UButton>
              <UButton :disabled="!createName.trim() || !selectableFeatures.length" :loading="creating" data-create-save @click="createSite">
                {{ t('studio.jobs.create') }}
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

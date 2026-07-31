<script setup lang="ts">
// Sites-Register (Control Plane, M6-T1) + Site-Erstellungs-Flow (M6-T2):
// Übersicht aller Sites mit Lifecycle-Status + Health, manuelle Registrierung
// bestehender Sites und „Neue Site" als Provisionierungs-Job — ausgeführt
// repo-seitig von `pnpm control:jobs` (§ 8: der Web-Prozess beschreibt nur).
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { WebsiteRow } from '../../../shared/types/website'
import type { ProductCatalogEntry, JobRow, SiteCreateJobPayload, SiteCreateJobResult } from '../../../shared/types/job'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t, locale } = useI18n()
const toast = useToast()
const confirm = useConfirm()

type WebsiteWithEntitlements = WebsiteRow & { entitlements: string[] }
const { data, refresh } = await useFetch<{ websites: WebsiteWithEntitlements[] }>('/api/control/websites')
const { data: jobsData, refresh: refreshJobs } = await useFetch<{ jobs: JobRow[] }>('/api/control/jobs')
const { data: catalogData } = await useFetch<{ products: ProductCatalogEntry[] }>('/api/control/products')

// Die Spalte „Workspace" (Zuordnung Site → abrechnender Workspace, M8-T2) ist
// mit A6 Schritt 5 gefallen: es gibt kein Workspace-Objekt mehr, dem man eine
// Site zuordnen könnte. Die Produkt-Zuteilung einer Site läuft unverändert
// über „Produkte" (entitlements.put) — die Lizenz-Mechanik bleibt geparkt.

// ── Manuelle Registrierung (T1) ─────────────────────────────────────────────
const showRegister = ref(false)
const form = reactive({ name: '', slug: '', projectId: '', endpoint: 'http://localhost/v1', appUrl: '' })

async function register() {
  try {
    await $fetch('/api/control/websites', { method: 'POST', body: { ...form, appUrl: form.appUrl || undefined } })
    toast.add({ title: t('control.websites.registered', { name: form.name }), color: 'success' })
    showRegister.value = false
    Object.assign(form, { name: '', slug: '', projectId: '', endpoint: 'http://localhost/v1', appUrl: '' })
  }
  catch (error) {
    toast.add({ title: t('control.websites.registerFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  await refresh()
}

const checking = ref<string | null>(null)
async function checkHealth(site: WebsiteRow) {
  checking.value = site.$id
  try {
    await $fetch(`/api/control/websites/${site.$id}/health`, { method: 'POST' })
  }
  catch {
    toast.add({ title: t('control.websites.healthFailed'), color: 'error' })
  }
  finally {
    checking.value = null
    await refresh()
  }
}

async function deregister(site: WebsiteRow) {
  try {
    const ok = await confirm({
      title: t('control.websites.deregisterTitle'),
      description: t('control.websites.deregisterConfirm', { name: site.name }),
      confirmLabel: t('control.websites.deregister'),
      action: () => $fetch(`/api/control/websites/${site.$id}`, { method: 'DELETE' }),
    })
    if (!ok) return
  }
  catch {
    toast.add({ title: t('control.websites.deregisterFailed'), color: 'error' })
  }
  await refresh()
}

// ── Neue Site (T2): create-site als Job ─────────────────────────────────────
const DEFAULT_PRODUCTS = ['themes', 'admin', 'comments', 'moderation']
const showCreate = ref(false)
const createName = ref('')
const selected = ref<string[]>([...DEFAULT_PRODUCTS])
const creating = ref(false)

/** Wählbar: alles außer core/system (implizit) und control (nur Control-Site). */
const selectableProducts = computed(() =>
  (catalogData.value?.products ?? [])
    .filter(f => !['core', 'system', 'control'].includes(f.key))
    .sort((a, b) => (a.tier === b.tier ? a.key.localeCompare(b.key) : a.tier === 'foundation' ? -1 : 1)))
const text = (value: { en: string, de: string }) => (locale.value.startsWith('de') ? value.de : value.en)

function toggleIn(list: Ref<string[]>, key: string, on: boolean) {
  const catalog = selectableProducts.value
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
    // Abwahl nimmt Produkte mit, die dieses voraussetzen
    list.value = list.value.filter(k =>
      k !== key && !(catalog.find(f => f.key === k)?.requires ?? []).includes(key))
  }
}
const toggleProduct = (key: string, on: boolean) => toggleIn(selected, key, on)

async function createSite() {
  creating.value = true
  try {
    await $fetch('/api/control/jobs', {
      method: 'POST',
      body: { type: 'site.create', name: createName.value.trim(), products: selected.value },
    })
    toast.add({ title: t('control.jobs.created', { name: createName.value.trim() }), color: 'success' })
    showCreate.value = false
    createName.value = ''
    selected.value = [...DEFAULT_PRODUCTS]
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
const entitlementSite = ref<WebsiteWithEntitlements | null>(null)
const grantSelection = ref<string[]>([])
const savingGrants = ref(false)

function openEntitlements(site: WebsiteWithEntitlements) {
  entitlementSite.value = site
  grantSelection.value = [...site.entitlements]
}
const toggleGrant = (key: string, on: boolean) => toggleIn(grantSelection, key, on)

async function saveEntitlements() {
  if (!entitlementSite.value) return
  savingGrants.value = true
  try {
    await $fetch(`/api/control/websites/${entitlementSite.value.$id}/entitlements`, {
      method: 'PUT',
      body: { products: grantSelection.value },
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

/** Produkt-Snapshot der Site (vom Health-Sweep, T4) — implizite Keys werden
 *  nicht angezeigt; läuft etwas ohne Entitlement, warnt der Chip. */
const IMPLICIT_PRODUCTS = ['core', 'system', 'control']
function runningProducts(site: WebsiteWithEntitlements): string[] {
  try {
    return (JSON.parse(site.products || '[]') as string[]).filter(key => !IMPLICIT_PRODUCTS.includes(key))
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

const websiteColumns = computed<TableColumn<WebsiteWithEntitlements>[]>(() => [
  { accessorKey: 'name', header: () => t('control.websites.col.site') },
  { id: 'state', header: () => t('control.websites.col.state') },
  { id: 'products', header: () => t('control.websites.col.products'), meta: { class: HIDE_LG } },
  { id: 'actions', header: () => '' },
])

const jobColumns = computed<TableColumn<JobRow>[]>(() => [
  { id: 'job', header: () => t('control.jobs.col.job') },
  { id: 'jobProducts', header: () => t('control.jobs.col.products'), meta: { class: HIDE_MD } },
  { accessorKey: 'status', header: () => t('control.jobs.col.status') },
  { id: 'jobActions', header: () => '' },
])

function siteActions(site: WebsiteWithEntitlements): DropdownMenuItem[][] {
  return [
    [
      { label: t('control.entitlements.manage'), icon: 'i-ph-stack', onSelect: () => openEntitlements(site) },
      { label: t('control.websites.check'), icon: 'i-ph-heartbeat', onSelect: () => { void checkHealth(site) } },
    ],
    [{ label: t('control.websites.deregister'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void deregister(site) } }],
  ]
}
</script>

<template>
  <UDashboardPanel id="sites">
    <template #header>
      <UDashboardNavbar :title="t('control.websites.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" color="neutral" variant="outline" data-sites-register @click="() => { showRegister = true }">
            {{ t('control.websites.register') }}
          </UButton>
          <UButton icon="i-ph-rocket-launch" data-sites-create @click="() => { showCreate = true }">
            {{ t('control.jobs.newSite') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable :data="data?.websites ?? []" :columns="websiteColumns" data-websites-list>
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
                {{ t('control.websites.lastCheck', { at: new Date(row.original.healthCheckedAt).toLocaleString() }) }}
              </p>
            </ClientOnly>
          </div>
        </template>
        <template #products-cell="{ row }">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-1" :data-site-entitlements="row.original.entitlements.join(',')">
              <template v-if="row.original.entitlements.length">
                <UBadge v-for="product in row.original.entitlements" :key="product" color="neutral" variant="outline" size="sm">{{ product }}</UBadge>
              </template>
              <span v-else class="text-xs text-muted">{{ t('control.entitlements.none') }}</span>
            </div>
            <div v-if="runningProducts(row.original).length" class="flex flex-wrap items-center gap-1" :data-site-running="runningProducts(row.original).join(',')">
              <span class="text-xs text-muted">{{ t('control.websites.running') }}</span>
              <UBadge
                v-for="product in runningProducts(row.original)"
                :key="product"
                :color="row.original.entitlements.includes(product) ? 'neutral' : 'warning'"
                variant="subtle"
                size="sm"
                :title="row.original.entitlements.includes(product) ? undefined : t('control.websites.runningUnentitled')"
              >
                {{ product }}
              </UBadge>
            </div>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="siteActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('control.websites.rowActions')"
                :loading="checking === row.original.$id"
                :data-site-check="row.original.slug"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-globe"
            :title="t('control.websites.emptyTitle')"
            :description="t('control.websites.empty')"
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
          <template #jobProducts-cell="{ row }">
            <span class="text-xs text-muted">{{ (jobPayload(row.original).products ?? []).join(', ') }}</span>
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
      <UModal :open="showRegister" :title="t('control.websites.registerTitle')" @update:open="() => { showRegister = false }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('control.websites.fieldName')"><UInput v-model="form.name" class="w-full" /></UFormField>
            <UFormField :label="t('control.websites.fieldSlug')"><UInput v-model="form.slug" class="w-full" placeholder="photos" /></UFormField>
            <UFormField :label="t('control.websites.fieldProjectId')" :hint="t('control.websites.fieldProjectIdHint')"><UInput v-model="form.projectId" class="w-full" placeholder="photos-qgry" /></UFormField>
            <UFormField :label="t('control.websites.fieldEndpoint')"><UInput v-model="form.endpoint" class="w-full" /></UFormField>
            <UFormField :label="t('control.websites.fieldAppUrl')"><UInput v-model="form.appUrl" class="w-full" placeholder="http://localhost:3003" /></UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { showRegister = false }">{{ t('control.websites.cancel') }}</UButton>
            <UButton data-sites-save @click="register">{{ t('control.websites.save') }}</UButton>
          </div>
        </template>
      </UModal>

      <!-- T3: Entitlements einer Site verwalten -->
      <UModal :open="!!entitlementSite" :title="t('control.entitlements.title', { name: entitlementSite?.name ?? '' })" @update:open="() => { entitlementSite = null }">
        <template #body>
          <UFormField :label="t('control.jobs.fieldProducts')" :help="t('control.entitlements.help')">
            <p v-if="!selectableProducts.length" class="text-sm text-muted">{{ t('control.jobs.catalogEmpty') }}</p>
            <div v-else class="max-h-72 space-y-2 overflow-y-auto pr-1">
              <UCheckbox
                v-for="product in selectableProducts"
                :key="product.key"
                :model-value="grantSelection.includes(product.key)"
                :label="text(product.title)"
                :description="text(product.description)"
                :data-grant-product="product.key"
                @update:model-value="toggleGrant(product.key, $event === true)"
              />
            </div>
          </UFormField>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { entitlementSite = null }">{{ t('control.websites.cancel') }}</UButton>
            <UButton :loading="savingGrants" :disabled="!selectableProducts.length" data-grant-save @click="saveEntitlements">
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
            <UFormField :label="t('control.jobs.fieldProducts')" :help="t('control.jobs.fieldProductsHelp')">
              <p v-if="!selectableProducts.length" class="text-sm text-muted">{{ t('control.jobs.catalogEmpty') }}</p>
              <div v-else class="max-h-72 space-y-2 overflow-y-auto pr-1">
                <UCheckbox
                  v-for="product in selectableProducts"
                  :key="product.key"
                  :model-value="selected.includes(product.key)"
                  :label="text(product.title)"
                  :description="text(product.description)"
                  :data-create-product="product.key"
                  @update:model-value="toggleProduct(product.key, $event === true)"
                />
              </div>
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full items-center justify-between gap-2">
            <p class="text-xs text-muted">{{ t('control.jobs.runnerHint') }}</p>
            <div class="flex gap-2">
              <UButton color="neutral" variant="ghost" @click="() => { showCreate = false }">{{ t('control.websites.cancel') }}</UButton>
              <UButton :disabled="!createName.trim() || !selectableProducts.length" :loading="creating" data-create-save @click="createSite">
                {{ t('control.jobs.create') }}
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
// Workspace-Verwaltung (M8-T2, Check-in: v1 = nur Betreiber im Control):
// Workspaces anlegen/umbenennen, Plan-/Status-Übersicht, zugeordnete Sites.
// Plan-Wechsel läuft BEWUSST nicht hier, sondern über Checkout + Fulfillment
// (T3) — plan/status sind in der PATCH-Route nicht schreibbar.
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { WorkspaceRow } from '../../../shared/types/workspace'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
const toast = useToast()
const appConfig = useAppConfig()

type WorkspaceWithSites = WorkspaceRow & { siteSlugs: string[], memberCount: number, pendingInvite: boolean }
const { data, refresh } = await useFetch<{ workspaces: WorkspaceWithSites[] }>('/api/control/workspaces')

// ── Owner einladen (M9-T2) ─────────────────────────────────────────────────
const inviting = ref<string | null>(null)
async function inviteOwner(workspace: WorkspaceWithSites) {
  inviting.value = workspace.$id
  try {
    const { email } = await $fetch<{ email: string }>(`/api/control/workspaces/${workspace.$id}/invite`, { method: 'POST' })
    toast.add({ title: t('control.invite.sent', { email }), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('control.invite.sendFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    inviting.value = null
  }
  await refresh()
}

const planFeatures = (plan: string): string[] =>
  (appConfig.maui as { studio?: { plans?: Record<string, { features: string[] }> } }).studio?.plans?.[plan]?.features ?? []

// ── Anlegen ────────────────────────────────────────────────────────────────
const showCreate = ref(false)
const form = reactive({ name: '', ownerEmail: '' })
const creating = ref(false)

async function createWorkspace() {
  creating.value = true
  try {
    await $fetch('/api/control/workspaces', { method: 'POST', body: { ...form } })
    toast.add({ title: t('control.workspaces.created', { name: form.name }), color: 'success' })
    showCreate.value = false
    Object.assign(form, { name: '', ownerEmail: '' })
  }
  catch (error) {
    toast.add({ title: t('control.workspaces.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    creating.value = false
  }
  await refresh()
}

// ── Stammdaten bearbeiten ──────────────────────────────────────────────────
const editing = ref<WorkspaceWithSites | null>(null)
const editForm = reactive({ name: '', ownerEmail: '' })
const savingEdit = ref(false)

function openEdit(workspace: WorkspaceWithSites) {
  editing.value = workspace
  Object.assign(editForm, { name: workspace.name, ownerEmail: workspace.ownerEmail })
}

async function saveEdit() {
  if (!editing.value) return
  savingEdit.value = true
  try {
    await $fetch(`/api/control/workspaces/${editing.value.$id}`, { method: 'PATCH', body: { ...editForm } })
    toast.add({ title: t('control.workspaces.saved', { name: editForm.name }), color: 'success' })
    editing.value = null
  }
  catch (error) {
    toast.add({ title: t('control.workspaces.saveFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    savingEdit.value = false
  }
  await refresh()
}

// ── Plan ändern (T3): paid → Stripe-hosted Checkout; free → Kündigungs-Hinweis ──
const planTarget = ref<WorkspaceWithSites | null>(null)
const chosenPlan = ref('')
const startingCheckout = ref(false)
const { locale } = useI18n()

const paidPlans = computed(() =>
  Object.entries((appConfig.maui as { studio?: { plans?: Record<string, { lookupKey: string | null }> } }).studio?.plans ?? {})
    .filter(([, plan]) => plan.lookupKey)
    .map(([key]) => key))

function openPlanChange(workspace: WorkspaceWithSites) {
  planTarget.value = workspace
  chosenPlan.value = paidPlans.value.find(key => key !== workspace.plan) ?? paidPlans.value[0] ?? ''
}

async function startCheckout() {
  if (!planTarget.value || !chosenPlan.value) return
  startingCheckout.value = true
  try {
    const { url } = await $fetch<{ url: string }>(`/api/control/workspaces/${planTarget.value.$id}/checkout`, {
      method: 'POST',
      body: { plan: chosenPlan.value, locale: locale.value.startsWith('de') ? 'de' : 'en' },
    })
    window.location.href = url
  }
  catch (error) {
    toast.add({ title: t('control.workspaces.checkoutFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
    startingCheckout.value = false
  }
}

const planColor = (plan: string) => (plan === 'pro' ? 'primary' : plan === 'personal' ? 'info' : 'neutral') as 'primary' | 'info' | 'neutral'
const statusColor = (s: string) => (s === 'active' ? 'success' : s === 'past_due' ? 'warning' : 'error') as 'success' | 'warning' | 'error'

// ── Stripe-Preise (App-Route /api/control/billing/prices) ─────────────────────
// Stripe-Preise sind unveränderlich — „ändern" legt einen neuen Price mit
// lookup_key-Transfer an und archiviert den alten. Neue Checkouts zahlen
// sofort den neuen Preis; Bestands-Abos behalten ihren (Grandfathering).
interface PriceDto { plan: string, interval: 'monthly' | 'yearly', lookupKey: string, amount: number | null, currency: string | null, productName: string | null }
const { data: pricesData, refresh: refreshPrices, error: pricesError } = await useFetch<{ prices: PriceDto[], livemode: boolean }>('/api/control/billing/prices', { lazy: true, server: false })
const priceEdits = reactive<Record<string, number>>({})
watch(() => pricesData.value?.prices, (prices) => {
  for (const price of prices ?? []) {
    // Cent → Euro fürs Eingabefeld
    priceEdits[price.lookupKey] = price.amount === null ? 0 : price.amount / 100
  }
}, { immediate: true })
const priceSaving = ref<string | null>(null)

async function savePrice(price: PriceDto) {
  const euro = priceEdits[price.lookupKey]
  if (euro === undefined || euro <= 0) return
  priceSaving.value = price.lookupKey
  try {
    await $fetch('/api/control/billing/prices', {
      method: 'POST',
      body: { plan: price.plan, interval: price.interval, amount: Math.round(euro * 100) },
    })
    toast.add({ title: t('control.prices.saved'), description: t('control.prices.grandfatherNote'), color: 'success' })
    await refreshPrices()
  }
  catch (error) {
    toast.add({ title: t('control.prices.saveFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    priceSaving.value = null
  }
}

const formatAmount = (price: PriceDto) => price.amount === null
  ? t('control.prices.missing')
  : new Intl.NumberFormat('de-DE', { style: 'currency', currency: (price.currency ?? 'eur').toUpperCase() }).format(price.amount / 100)

const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<WorkspaceWithSites>[]>(() => [
  { accessorKey: 'name', header: () => t('control.workspaces.col.workspace') },
  { accessorKey: 'ownerEmail', header: () => t('control.workspaces.col.owner') },
  { accessorKey: 'plan', header: () => t('control.workspaces.col.plan') },
  { accessorKey: 'status', header: () => t('control.workspaces.col.status'), meta: { class: HIDE_MD } },
  { id: 'sites', header: () => t('control.workspaces.col.sites'), meta: { class: HIDE_LG } },
  { id: 'actions', header: () => '' },
])

/**
 * Zeilen-Aktionen. „Einladen" erscheint weiter NUR, solange kein Mitglied
 * aktiv ist (memberCount === 0) — dieselbe Bedingung wie zuvor am Knopf.
 */
function rowActions(workspace: WorkspaceWithSites): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = []
  if (workspace.memberCount === 0) {
    items.push({
      label: workspace.pendingInvite ? t('control.invite.resend') : t('control.invite.send'),
      icon: 'i-ph-paper-plane-tilt',
      onSelect: () => { void inviteOwner(workspace) },
    })
  }
  items.push(
    { label: t('control.workspaces.changePlan'), icon: 'i-ph-credit-card', onSelect: () => openPlanChange(workspace) },
    { label: t('control.workspaces.edit'), icon: 'i-ph-pencil-simple', onSelect: () => openEdit(workspace) },
  )
  return [items]
}
</script>

<template>
  <UDashboardPanel id="workspaces">
    <template #header>
      <UDashboardNavbar :title="t('control.workspaces.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" data-workspaces-create @click="() => { showCreate = true }">
            {{ t('control.workspaces.create') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable :data="data?.workspaces ?? []" :columns="columns" data-workspaces-list>
        <template #name-cell="{ row }">
          <div class="min-w-0" :data-workspace="row.original.name">
            <p class="font-medium">{{ row.original.name }}</p>
            <p class="text-xs text-muted">
              {{ t('control.workspaces.planFeatures') }}: {{ planFeatures(row.original.plan).join(', ') || '—' }}
            </p>
          </div>
        </template>
        <template #ownerEmail-cell="{ row }">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span class="truncate text-sm">{{ row.original.ownerEmail }}</span>
            <UBadge v-if="row.original.memberCount > 0" color="success" variant="subtle" size="sm" data-workspace-owner-active>{{ t('control.invite.ownerActive') }}</UBadge>
            <UBadge v-else-if="row.original.pendingInvite" color="info" variant="subtle" size="sm" data-workspace-invite-pending>{{ t('control.invite.pending') }}</UBadge>
          </div>
        </template>
        <template #plan-cell="{ row }">
          <UBadge :color="planColor(row.original.plan)" variant="subtle" size="sm" :data-workspace-plan="row.original.plan">{{ row.original.plan }}</UBadge>
        </template>
        <template #status-cell="{ row }">
          <UBadge :color="statusColor(row.original.status)" variant="subtle" size="sm">{{ row.original.status }}</UBadge>
        </template>
        <template #sites-cell="{ row }">
          <div class="flex flex-wrap items-center gap-1" :data-workspace-sites="row.original.siteSlugs.join(',')">
            <template v-if="row.original.siteSlugs.length">
              <UBadge v-for="slug in row.original.siteSlugs" :key="slug" color="neutral" variant="outline" size="sm">{{ slug }}</UBadge>
            </template>
            <span v-else class="text-xs text-muted">{{ t('control.workspaces.noSites') }}</span>
          </div>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('control.workspaces.rowActions')"
                :loading="inviting === row.original.$id"
                :data-workspace-edit="row.original.name"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-briefcase"
            :title="t('control.workspaces.emptyTitle')"
            :description="t('control.workspaces.empty')"
            :action-label="t('control.workspaces.create')"
            action-icon="i-ph-plus"
            data-workspaces-empty
            @action="() => { showCreate = true }"
          />
        </template>
      </UTable>

      <!-- Stripe-Preise des Plan-Katalogs: editierbar per lookup_key-Transfer.
           Bestands-Abos behalten den alten Preis (Grandfathering-Hinweis). -->
      <section class="mt-8 rounded-lg border border-default p-4" data-price-admin>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold">{{ t('control.prices.title') }}</h2>
          <UBadge v-if="pricesData" :color="pricesData.livemode ? 'success' : 'warning'" variant="subtle" size="sm">
            {{ pricesData.livemode ? 'Live' : 'Test' }}
          </UBadge>
        </div>
        <p class="mt-1 text-sm text-muted">{{ t('control.prices.subtitle') }}</p>
        <p v-if="pricesError" class="mt-3 text-sm text-warning">{{ t('control.prices.unavailable') }}</p>
        <div v-else class="mt-4 space-y-3">
          <div v-for="price in pricesData?.prices ?? []" :key="price.lookupKey" class="flex flex-wrap items-end gap-3" :data-price-row="price.lookupKey">
            <UBadge :color="planColor(price.plan)" variant="subtle" class="mb-1.5 w-20 justify-center">{{ price.plan }}</UBadge>
            <span class="mb-1.5 w-24 text-sm text-muted">{{ t(`control.prices.interval.${price.interval}`) }}</span>
            <span class="mb-1.5 w-24 text-sm font-medium" data-price-current>{{ formatAmount(price) }}</span>
            <UFormField :label="t('control.prices.newAmount')" size="sm">
              <UInput v-model.number="priceEdits[price.lookupKey]" type="number" min="1" step="0.01" size="sm" class="w-32" :disabled="price.amount === null" />
            </UFormField>
            <UButton
              size="sm"
              variant="soft"
              :loading="priceSaving === price.lookupKey"
              :disabled="price.amount === null"
              :label="t('control.prices.save')"
              @click="() => savePrice(price)"
            />
          </div>
        </div>
        <p class="mt-3 text-xs text-dimmed">{{ t('control.prices.grandfatherNote') }}</p>
      </section>

      <UModal :open="showCreate" :title="t('control.workspaces.createTitle')" @update:open="() => { showCreate = false }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('control.workspaces.fieldName')"><UInput v-model="form.name" class="w-full" data-workspace-name /></UFormField>
            <UFormField :label="t('control.workspaces.fieldOwnerEmail')" :hint="t('control.workspaces.fieldOwnerEmailHint')">
              <UInput v-model="form.ownerEmail" type="email" class="w-full" data-workspace-email />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { showCreate = false }">{{ t('control.sites.cancel') }}</UButton>
            <UButton :disabled="!form.name.trim() || !form.ownerEmail.trim()" :loading="creating" data-workspace-save @click="createWorkspace">
              {{ t('control.workspaces.create') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- T3: Plan ändern — paid via Stripe-hosted Checkout, Downgrade via Kündigung -->
      <UModal :open="!!planTarget" :title="t('control.workspaces.changePlanTitle', { name: planTarget?.name ?? '' })" @update:open="() => { planTarget = null }">
        <template #body>
          <div class="space-y-4">
            <p class="text-sm text-muted">
              {{ t('control.workspaces.currentPlan') }}: <UBadge :color="planColor(planTarget?.plan ?? 'basic')" variant="subtle" size="sm">{{ planTarget?.plan }}</UBadge>
            </p>
            <UFormField :label="t('control.workspaces.targetPlan')" :help="t('control.workspaces.changePlanHelp')">
              <URadioGroup
                v-model="chosenPlan"
                :items="paidPlans.map(key => ({ label: `${key} — ${planFeatures(key).join(', ')}`, value: key }))"
                data-plan-choice
              />
            </UFormField>
            <p class="text-xs text-muted">{{ t('control.workspaces.downgradeHint') }}</p>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { planTarget = null }">{{ t('control.sites.cancel') }}</UButton>
            <UButton :disabled="!chosenPlan || chosenPlan === planTarget?.plan" :loading="startingCheckout" data-plan-checkout @click="startCheckout">
              {{ t('control.workspaces.toCheckout') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal :open="!!editing" :title="t('control.workspaces.editTitle', { name: editing?.name ?? '' })" @update:open="() => { editing = null }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('control.workspaces.fieldName')"><UInput v-model="editForm.name" class="w-full" /></UFormField>
            <UFormField :label="t('control.workspaces.fieldOwnerEmail')"><UInput v-model="editForm.ownerEmail" type="email" class="w-full" /></UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { editing = null }">{{ t('control.sites.cancel') }}</UButton>
            <UButton :loading="savingEdit" @click="saveEdit">{{ t('control.sites.save') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

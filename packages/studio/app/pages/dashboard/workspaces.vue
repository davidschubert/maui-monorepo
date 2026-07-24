<script setup lang="ts">
// Workspace-Verwaltung (M8-T2, Check-in: v1 = nur Betreiber im Studio):
// Workspaces anlegen/umbenennen, Plan-/Status-Übersicht, zugeordnete Sites.
// Plan-Wechsel läuft BEWUSST nicht hier, sondern über Checkout + Fulfillment
// (T3) — plan/status sind in der PATCH-Route nicht schreibbar.
import type { WorkspaceRow } from '../../../shared/types/workspace'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
const toast = useToast()
const appConfig = useAppConfig()

type WorkspaceWithSites = WorkspaceRow & { siteSlugs: string[], memberCount: number, pendingInvite: boolean }
const { data, refresh } = await useFetch<{ workspaces: WorkspaceWithSites[] }>('/api/studio/workspaces')

// ── Owner einladen (M9-T2) ─────────────────────────────────────────────────
const inviting = ref<string | null>(null)
async function inviteOwner(workspace: WorkspaceWithSites) {
  inviting.value = workspace.$id
  try {
    const { email } = await $fetch<{ email: string }>(`/api/studio/workspaces/${workspace.$id}/invite`, { method: 'POST' })
    toast.add({ title: t('studio.invite.sent', { email }), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('studio.invite.sendFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
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
    await $fetch('/api/studio/workspaces', { method: 'POST', body: { ...form } })
    toast.add({ title: t('studio.workspaces.created', { name: form.name }), color: 'success' })
    showCreate.value = false
    Object.assign(form, { name: '', ownerEmail: '' })
  }
  catch (error) {
    toast.add({ title: t('studio.workspaces.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
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
    await $fetch(`/api/studio/workspaces/${editing.value.$id}`, { method: 'PATCH', body: { ...editForm } })
    toast.add({ title: t('studio.workspaces.saved', { name: editForm.name }), color: 'success' })
    editing.value = null
  }
  catch (error) {
    toast.add({ title: t('studio.workspaces.saveFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
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
    const { url } = await $fetch<{ url: string }>(`/api/studio/workspaces/${planTarget.value.$id}/checkout`, {
      method: 'POST',
      body: { plan: chosenPlan.value, locale: locale.value.startsWith('de') ? 'de' : 'en' },
    })
    window.location.href = url
  }
  catch (error) {
    toast.add({ title: t('studio.workspaces.checkoutFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
    startingCheckout.value = false
  }
}

const planColor = (plan: string) => (plan === 'business' ? 'primary' : plan === 'pro' ? 'info' : 'neutral') as 'primary' | 'info' | 'neutral'
const statusColor = (s: string) => (s === 'active' ? 'success' : s === 'past_due' ? 'warning' : 'error') as 'success' | 'warning' | 'error'

// ── Stripe-Preise (App-Route /api/studio/billing/prices) ─────────────────────
// Stripe-Preise sind unveränderlich — „ändern" legt einen neuen Price mit
// lookup_key-Transfer an und archiviert den alten. Neue Checkouts zahlen
// sofort den neuen Preis; Bestands-Abos behalten ihren (Grandfathering).
interface PriceDto { plan: string, interval: 'monthly' | 'yearly', lookupKey: string, amount: number | null, currency: string | null, productName: string | null }
const { data: pricesData, refresh: refreshPrices, error: pricesError } = await useFetch<{ prices: PriceDto[], livemode: boolean }>('/api/studio/billing/prices', { lazy: true, server: false })
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
    await $fetch('/api/studio/billing/prices', {
      method: 'POST',
      body: { plan: price.plan, interval: price.interval, amount: Math.round(euro * 100) },
    })
    toast.add({ title: t('studio.prices.saved'), description: t('studio.prices.grandfatherNote'), color: 'success' })
    await refreshPrices()
  }
  catch (error) {
    toast.add({ title: t('studio.prices.saveFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    priceSaving.value = null
  }
}

const formatAmount = (price: PriceDto) => price.amount === null
  ? t('studio.prices.missing')
  : new Intl.NumberFormat('de-DE', { style: 'currency', currency: (price.currency ?? 'eur').toUpperCase() }).format(price.amount / 100)
</script>

<template>
  <UDashboardPanel id="workspaces">
    <template #header>
      <UDashboardNavbar :title="t('studio.workspaces.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" data-workspaces-create @click="() => { showCreate = true }">
            {{ t('studio.workspaces.create') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p v-if="!data?.workspaces.length" class="py-12 text-center text-sm text-muted" data-workspaces-empty>
        {{ t('studio.workspaces.empty') }}
      </p>

      <div v-else class="divide-y divide-default" data-workspaces-list>
        <div v-for="workspace in data.workspaces" :key="workspace.$id" class="flex flex-wrap items-center justify-between gap-3 py-4" :data-workspace="workspace.name">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ workspace.name }}</p>
              <UBadge :color="planColor(workspace.plan)" variant="subtle" size="sm" :data-workspace-plan="workspace.plan">{{ workspace.plan }}</UBadge>
              <UBadge :color="statusColor(workspace.status)" variant="subtle" size="sm">{{ workspace.status }}</UBadge>
            </div>
            <p class="mt-0.5 flex flex-wrap items-center gap-2 truncate text-sm text-muted">
              {{ workspace.ownerEmail }}
              <UBadge v-if="workspace.memberCount > 0" color="success" variant="subtle" size="sm" data-workspace-owner-active>{{ t('studio.invite.ownerActive') }}</UBadge>
              <UBadge v-else-if="workspace.pendingInvite" color="info" variant="subtle" size="sm" data-workspace-invite-pending>{{ t('studio.invite.pending') }}</UBadge>
            </p>
            <div class="mt-1 flex flex-wrap items-center gap-1" :data-workspace-sites="workspace.siteSlugs.join(',')">
              <template v-if="workspace.siteSlugs.length">
                <UBadge v-for="slug in workspace.siteSlugs" :key="slug" color="neutral" variant="outline" size="sm">{{ slug }}</UBadge>
              </template>
              <span v-else class="text-xs text-muted">{{ t('studio.workspaces.noSites') }}</span>
            </div>
            <p class="mt-1 text-xs text-muted">
              {{ t('studio.workspaces.planFeatures') }}: {{ planFeatures(workspace.plan).join(', ') || '—' }}
            </p>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              v-if="workspace.memberCount === 0"
              icon="i-ph-paper-plane-tilt"
              size="sm"
              color="neutral"
              variant="ghost"
              :loading="inviting === workspace.$id"
              :data-workspace-invite="workspace.name"
              @click="inviteOwner(workspace)"
            >
              {{ workspace.pendingInvite ? t('studio.invite.resend') : t('studio.invite.send') }}
            </UButton>
            <UButton icon="i-ph-credit-card" size="sm" color="neutral" variant="ghost" :data-workspace-plan-change="workspace.name" @click="openPlanChange(workspace)">
              {{ t('studio.workspaces.changePlan') }}
            </UButton>
            <UButton icon="i-ph-pencil-simple" size="sm" color="neutral" variant="ghost" :data-workspace-edit="workspace.name" @click="openEdit(workspace)">
              {{ t('studio.workspaces.edit') }}
            </UButton>
          </div>
        </div>
      </div>

      <!-- Stripe-Preise des Plan-Katalogs: editierbar per lookup_key-Transfer.
           Bestands-Abos behalten den alten Preis (Grandfathering-Hinweis). -->
      <section class="mt-8 rounded-lg border border-default p-4" data-price-admin>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold">{{ t('studio.prices.title') }}</h2>
          <UBadge v-if="pricesData" :color="pricesData.livemode ? 'success' : 'warning'" variant="subtle" size="sm">
            {{ pricesData.livemode ? 'Live' : 'Test' }}
          </UBadge>
        </div>
        <p class="mt-1 text-sm text-muted">{{ t('studio.prices.subtitle') }}</p>
        <p v-if="pricesError" class="mt-3 text-sm text-warning">{{ t('studio.prices.unavailable') }}</p>
        <div v-else class="mt-4 space-y-3">
          <div v-for="price in pricesData?.prices ?? []" :key="price.lookupKey" class="flex flex-wrap items-end gap-3" :data-price-row="price.lookupKey">
            <UBadge :color="planColor(price.plan)" variant="subtle" class="mb-1.5 w-20 justify-center">{{ price.plan }}</UBadge>
            <span class="mb-1.5 w-24 text-sm text-muted">{{ t(`studio.prices.interval.${price.interval}`) }}</span>
            <span class="mb-1.5 w-24 text-sm font-medium" data-price-current>{{ formatAmount(price) }}</span>
            <UFormField :label="t('studio.prices.newAmount')" size="sm">
              <UInput v-model.number="priceEdits[price.lookupKey]" type="number" min="1" step="0.01" size="sm" class="w-32" :disabled="price.amount === null" />
            </UFormField>
            <UButton
              size="sm"
              variant="soft"
              :loading="priceSaving === price.lookupKey"
              :disabled="price.amount === null"
              :label="t('studio.prices.save')"
              @click="() => savePrice(price)"
            />
          </div>
        </div>
        <p class="mt-3 text-xs text-dimmed">{{ t('studio.prices.grandfatherNote') }}</p>
      </section>

      <UModal :open="showCreate" :title="t('studio.workspaces.createTitle')" @update:open="() => { showCreate = false }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('studio.workspaces.fieldName')"><UInput v-model="form.name" class="w-full" data-workspace-name /></UFormField>
            <UFormField :label="t('studio.workspaces.fieldOwnerEmail')" :hint="t('studio.workspaces.fieldOwnerEmailHint')">
              <UInput v-model="form.ownerEmail" type="email" class="w-full" data-workspace-email />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { showCreate = false }">{{ t('studio.sites.cancel') }}</UButton>
            <UButton :disabled="!form.name.trim() || !form.ownerEmail.trim()" :loading="creating" data-workspace-save @click="createWorkspace">
              {{ t('studio.workspaces.create') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <!-- T3: Plan ändern — paid via Stripe-hosted Checkout, Downgrade via Kündigung -->
      <UModal :open="!!planTarget" :title="t('studio.workspaces.changePlanTitle', { name: planTarget?.name ?? '' })" @update:open="() => { planTarget = null }">
        <template #body>
          <div class="space-y-4">
            <p class="text-sm text-muted">
              {{ t('studio.workspaces.currentPlan') }}: <UBadge :color="planColor(planTarget?.plan ?? 'free')" variant="subtle" size="sm">{{ planTarget?.plan }}</UBadge>
            </p>
            <UFormField :label="t('studio.workspaces.targetPlan')" :help="t('studio.workspaces.changePlanHelp')">
              <URadioGroup
                v-model="chosenPlan"
                :items="paidPlans.map(key => ({ label: `${key} — ${planFeatures(key).join(', ')}`, value: key }))"
                data-plan-choice
              />
            </UFormField>
            <p class="text-xs text-muted">{{ t('studio.workspaces.downgradeHint') }}</p>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { planTarget = null }">{{ t('studio.sites.cancel') }}</UButton>
            <UButton :disabled="!chosenPlan || chosenPlan === planTarget?.plan" :loading="startingCheckout" data-plan-checkout @click="startCheckout">
              {{ t('studio.workspaces.toCheckout') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal :open="!!editing" :title="t('studio.workspaces.editTitle', { name: editing?.name ?? '' })" @update:open="() => { editing = null }">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('studio.workspaces.fieldName')"><UInput v-model="editForm.name" class="w-full" /></UFormField>
            <UFormField :label="t('studio.workspaces.fieldOwnerEmail')"><UInput v-model="editForm.ownerEmail" type="email" class="w-full" /></UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { editing = null }">{{ t('studio.sites.cancel') }}</UButton>
            <UButton :loading="savingEdit" @click="saveEdit">{{ t('studio.sites.save') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

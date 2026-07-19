<script setup lang="ts">
/**
 * Kundenbereich (M9-T3): eigene Workspaces des eingeloggten Owners —
 * Plan/Status, „Plan ändern" (Owner-Checkout), „Abrechnung verwalten"
 * (Stripe-Portal), Sites read-only. BEWUSST getrennt vom Betreiber-
 * /dashboard. Nimmt geparkte Einladungs-Tokens automatisch an
 * (localStorage-Brücke aus /workspace/accept).
 */
import type { StudioPlanCatalog } from '../../../shared/types/workspace'

definePageMeta({ middleware: ['auth'] })

const { t, locale } = useI18n()
const toast = useToast()
const appConfig = useAppConfig()

interface OwnWorkspace {
  id: string
  name: string
  plan: string
  planFeatures: string[]
  status: string
  role: string
  sites: { name: string, appUrl: string, healthStatus: string }[]
}

const { data, refresh } = await useFetch<{ workspaces: OwnWorkspace[] }>('/api/workspace')

// Geparkter Einladungs-Token (Accept-Seite ohne Login) → jetzt einlösen
const TOKEN_KEY = 'workspace-invite-token'
onMounted(async () => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return
  try {
    await $fetch('/api/workspace/accept', { method: 'POST', body: { token } })
    toast.add({ title: t('studio.invite.successTitle'), color: 'success' })
    await refresh()
  }
  catch {
    // abgelaufen/fremde Adresse — still verwerfen, die Accept-Seite erklärt es
  }
  finally {
    localStorage.removeItem(TOKEN_KEY)
  }
})

const paidPlans = computed(() =>
  Object.entries((appConfig.maui as { studio?: { plans?: StudioPlanCatalog } }).studio?.plans ?? {})
    .filter(([, plan]) => plan.lookupKey)
    .map(([key, plan]) => ({ key, features: plan.features })))

// ── Plan ändern (Owner-Checkout) ───────────────────────────────────────────
const planTarget = ref<OwnWorkspace | null>(null)
const chosenPlan = ref('')
const startingCheckout = ref(false)

function openPlanChange(workspace: OwnWorkspace) {
  planTarget.value = workspace
  chosenPlan.value = paidPlans.value.find(plan => plan.key !== workspace.plan)?.key ?? paidPlans.value[0]?.key ?? ''
}

async function startCheckout() {
  if (!planTarget.value || !chosenPlan.value) return
  startingCheckout.value = true
  try {
    const { url } = await $fetch<{ url: string }>(`/api/workspace/${planTarget.value.id}/checkout`, {
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

// ── Stripe-Portal (Kündigung/Zahlungsmethode/Rechnungen) ───────────────────
const openingPortal = ref(false)
async function openPortal() {
  openingPortal.value = true
  try {
    const { url } = await $fetch<{ url: string }>('/api/workspace/portal', {
      method: 'POST',
      query: { locale: locale.value.startsWith('de') ? 'de' : 'en' },
    })
    window.location.href = url
  }
  catch (error) {
    const status = (error as { status?: number, statusCode?: number })
    const noAccount = status.status === 404 || status.statusCode === 404
    toast.add({ title: noAccount ? t('studio.customer.noBillingYet') : t('studio.customer.portalFailed'), color: noAccount ? 'info' : 'error' })
    openingPortal.value = false
  }
}

const planColor = (plan: string) => (plan === 'business' ? 'primary' : plan === 'pro' ? 'info' : 'neutral') as 'primary' | 'info' | 'neutral'
const statusColor = (s: string) => (s === 'active' ? 'success' : s === 'past_due' ? 'warning' : 'error') as 'success' | 'warning' | 'error'
const healthColor = (s: string) => (s === 'ok' ? 'success' : s === 'degraded' ? 'warning' : s === 'down' ? 'error' : 'neutral') as 'success' | 'warning' | 'error' | 'neutral'
</script>

<template>
  <UContainer class="max-w-3xl py-10">
    <h1 class="text-2xl font-bold">{{ t('studio.customer.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('studio.customer.subtitle') }}</p>

    <p v-if="!data?.workspaces.length" class="mt-12 text-center text-sm text-muted" data-customer-empty>
      {{ t('studio.customer.empty') }}
    </p>

    <div v-else class="mt-8 space-y-6" data-customer-workspaces>
      <UCard v-for="workspace in data.workspaces" :key="workspace.id" :data-customer-workspace="workspace.name">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-semibold">{{ workspace.name }}</h2>
            <UBadge :color="planColor(workspace.plan)" variant="subtle" :data-customer-plan="workspace.plan">{{ workspace.plan }}</UBadge>
            <UBadge :color="statusColor(workspace.status)" variant="subtle">{{ workspace.status }}</UBadge>
          </div>
          <div class="flex items-center gap-2">
            <UButton size="sm" icon="i-ph-credit-card" data-customer-plan-change @click="openPlanChange(workspace)">
              {{ t('studio.workspaces.changePlan') }}
            </UButton>
            <UButton size="sm" color="neutral" variant="outline" icon="i-ph-receipt" :loading="openingPortal" data-customer-portal @click="openPortal">
              {{ t('studio.customer.portal') }}
            </UButton>
          </div>
        </div>

        <p class="mt-2 text-xs text-muted">
          {{ t('studio.workspaces.planFeatures') }}: {{ workspace.planFeatures.join(', ') || '—' }}
        </p>

        <div class="mt-4 space-y-2">
          <p class="text-sm font-medium">{{ t('studio.customer.sites') }}</p>
          <p v-if="!workspace.sites.length" class="text-sm text-muted">{{ t('studio.workspaces.noSites') }}</p>
          <div v-for="site in workspace.sites" :key="site.name" class="flex items-center justify-between gap-2 rounded-md bg-elevated px-3 py-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ site.name }}</span>
              <UBadge :color="healthColor(site.healthStatus)" variant="subtle" size="sm">{{ site.healthStatus }}</UBadge>
            </div>
            <a v-if="site.appUrl" :href="site.appUrl" target="_blank" rel="noopener" class="text-sm text-muted underline">{{ site.appUrl }}</a>
          </div>
        </div>
      </UCard>
    </div>

    <UModal :open="!!planTarget" :title="t('studio.workspaces.changePlanTitle', { name: planTarget?.name ?? '' })" @update:open="planTarget = null">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            {{ t('studio.workspaces.currentPlan') }}: <UBadge :color="planColor(planTarget?.plan ?? 'free')" variant="subtle" size="sm">{{ planTarget?.plan }}</UBadge>
          </p>
          <UFormField :label="t('studio.workspaces.targetPlan')" :help="t('studio.workspaces.changePlanHelp')">
            <URadioGroup
              v-model="chosenPlan"
              :items="paidPlans.map(plan => ({ label: `${plan.key} — ${plan.features.join(', ')}`, value: plan.key }))"
              data-customer-plan-choice
            />
          </UFormField>
          <p class="text-xs text-muted">{{ t('studio.customer.downgradeHint') }}</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="planTarget = null">{{ t('studio.sites.cancel') }}</UButton>
          <UButton :disabled="!chosenPlan || chosenPlan === planTarget?.plan" :loading="startingCheckout" data-customer-plan-checkout @click="startCheckout">
            {{ t('studio.workspaces.toCheckout') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

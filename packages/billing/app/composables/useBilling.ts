import { BILLING_SUBSCRIPTIONS_TABLE, type BillingSubscriptionResponse, type MauiBillingConfig } from '../../shared/types/billing'

/**
 * Billing-Zustand des eingeloggten Users (B22): SSR-hydriert über
 * GET /api/billing/subscription, Realtime-Refresh auf die eigene
 * Subscription-Row (Row-Security filtert server-seitig) — die Billing-Seite
 * springt nach dem Checkout live auf „aktiv", sobald der Webhook schrieb.
 */
export function useBilling() {
  const appConfig = useAppConfig()
  const config = useRuntimeConfig()

  const billingConfig = computed<MauiBillingConfig>(() => {
    const billing = (appConfig.maui as { billing?: Partial<MauiBillingConfig> } | undefined)?.billing
    return {
      enabled: billing?.enabled ?? false,
      currency: billing?.currency ?? 'eur',
      trialDays: billing?.trialDays ?? 0,
      plans: billing?.plans ?? [],
    }
  })

  const { data, refresh } = useFetch<BillingSubscriptionResponse>('/api/billing/subscription', {
    key: 'billing:subscription',
    immediate: billingConfig.value.enabled,
    // 404 (Gate aus) still schlucken — Zustand bleibt free
    ignoreResponseError: true,
    default: () => ({ subscription: null, planId: null, features: [], entitled: false }),
  })

  const subscription = computed(() => data.value?.subscription ?? null)
  const planId = computed(() => data.value?.planId ?? null)
  const entitled = computed(() => data.value?.entitled ?? false)
  const hasFeature = (feature: string) => (data.value?.features ?? []).includes(feature)

  // Realtime auf die EIGENE Row (sofern vorhanden) — Muster PostFeed:
  // Stop-Funktion selbst halten, onMounted hat keinen Effect-Scope
  let stopRealtime: (() => void) | undefined
  onMounted(() => {
    if (!billingConfig.value.enabled) return
    stopRealtime = useRealtimeRows(
      config.public.appwriteDatabaseId,
      BILLING_SUBSCRIPTIONS_TABLE,
      () => { void refresh() },
    )
  })
  onBeforeUnmount(() => stopRealtime?.())

  return { config: billingConfig, subscription, planId, entitled, hasFeature, refresh }
}

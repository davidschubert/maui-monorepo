/**
 * Plan des aktuellen Pool-Tenants (SSR-gespiegelt, s. tenant-brand-Plugin)
 * + UI-Helfer fürs Produkt-Gating. null = kein Pool-Tenant (Silo/Control-
 * Host) → alles sichtbar. Die AUTORITÄT ist server-seitig
 * (requirePlanProduct) — hier geht es nur um Sichtbarkeit.
 */
export function useTenantPlan() {
  const plan = useState<string | null>('pukalani-tenant-plan', () => null)
  const appConfig = useAppConfig()

  const tenancy = computed(() => (appConfig.pukalani as {
    tenancy?: { quota?: { plans?: Record<string, unknown> }, products?: Record<string, string | undefined> }
  }).tenancy)
  const planOrder = computed(() => Object.keys(tenancy.value?.quota?.plans ?? {}))

  /** Mindest-Plan eines Produkts (undefined = frei/Basic). */
  function minPlanFor(product: string): string | undefined {
    return tenancy.value?.products?.[product]
  }

  /** Enthält der Plan dieses Tenants das Produkt? (Ohne Tenant: ja.) */
  function planAllows(product: string): boolean {
    const minPlan = minPlanFor(product)
    if (!minPlan || plan.value === null) return true
    const minRank = planOrder.value.indexOf(minPlan)
    if (minRank === -1) return true
    const rank = planOrder.value.indexOf(plan.value)
    return (rank === -1 ? 0 : rank) >= minRank
  }

  return { plan, planOrder, minPlanFor, planAllows }
}

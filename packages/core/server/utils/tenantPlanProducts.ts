import type { H3Event } from 'h3'

/**
 * Produkt-Gating pro Tenant-Plan (P4, Davids Pricing-Entscheid 2026-07-26).
 *
 * Konfiguration in der App (app.config.ts):
 *
 *   maui: { tenancy: {
 *     // aufsteigend — Position = Rang. Quota-Katalog nutzt dieselben Keys.
 *     quota: { plans: { basic: …, personal: …, pro: … } },
 *     // Produkt-Key → Mindest-Plan. Nicht gelistete Produkte sind frei.
 *     products: { posts: 'personal', ai: 'pro' },
 *   } }
 *
 * Die Plan-ORDNUNG kommt aus den Keys des quota.plans-Katalogs (aufsteigend
 * sortiert, Konvention wie limitsForPlan) — core bleibt plan-name-agnostisch.
 * Semantik wie die Quota: greift NUR für Pool-Tenants. Silo-Apps gaten über
 * site.manifest + Entitlements; ohne Tenant-Kontext (Control-Hosts,
 * Einzelbetrieb) ist alles erlaubt.
 */

interface TenancyProductsConfig {
  quota?: { plans?: Record<string, unknown> }
  products?: Record<string, string | undefined>
}

/** PURE Entscheidung (unit-getestet): darf `plan` das Produkt `product`? */
export function planAllowsProduct(
  planOrder: readonly string[],
  products: Record<string, string | undefined> | undefined,
  plan: string | undefined,
  product: string,
): boolean {
  const minPlan = products?.[product]
  if (!minPlan) return true
  const minRank = planOrder.indexOf(minPlan)
  if (minRank === -1) return true // unbekannter Katalog-Eintrag → fail-open wie Quota
  const rank = plan ? planOrder.indexOf(plan) : 0
  return (rank === -1 ? 0 : rank) >= minRank
}

/**
 * Wirft 404, wenn der Plan des Pool-Tenants das Produkt nicht enthält —
 * bewusst 404 statt 403: für diesen Mandanten EXISTIERT das Produkt nicht
 * (derselbe Grundsatz wie die Datentür bei fremden Rows).
 */
export function requirePlanProduct(event: H3Event, product: string): void {
  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') return

  const appConfig = useAppConfig() as { maui?: { tenancy?: TenancyProductsConfig } }
  const tenancy = appConfig.maui?.tenancy
  const planOrder = Object.keys(tenancy?.quota?.plans ?? {})
  if (!planAllowsProduct(planOrder, tenancy?.products, tenant.plan, product)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
}

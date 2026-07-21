import type { FeatureCatalogEntry } from './types/job'
import type { StudioPlan, StudioPlanCatalog, WorkspaceBillingInterval } from './types/workspace'

/**
 * M8 Workspace-Billing — die PUREN Bausteine (ohne Stripe, ohne I/O):
 * Plan-Key → gewünschte Entitlement-Sets je Site, und verifiziertes
 * billing-Event → Workspace-Patch. Der Fulfillment-Handler (folgt nach dem
 * M8-Check-in) verdrahtet nur noch diese Funktionen mit den bestehenden
 * Grant-/Zustell-Wegen (entitlements.put-Logik + F3-Signatur-Pull).
 */

/** Requires-Schluss über den Feature-Katalog: gewählte Features plus alles,
 *  was sie transitiv voraussetzen. Unbekannte Keys sind ein Fehler — der
 *  Katalog ist die Autorität (F7), ein Tippfehler darf nie still ein
 *  leeres Grant-Set produzieren. */
export function closeOverRequires(
  features: readonly string[],
  catalog: readonly Pick<FeatureCatalogEntry, 'key' | 'requires'>[],
): string[] {
  const byKey = new Map(catalog.map(entry => [entry.key, entry]))
  const result = new Set<string>()
  const queue = [...features]
  while (queue.length > 0) {
    const key = queue.pop()!
    if (result.has(key)) continue
    const entry = byKey.get(key)
    if (!entry) throw new Error(`Unbekanntes Feature "${key}" (nicht im Katalog)`)
    result.add(key)
    queue.push(...entry.requires)
  }
  return [...result].sort()
}

/** Den passenden Stripe-lookup_key für Plan + Intervall wählen. Jahres-Preis
 *  optional: fehlt er, fällt 'yearly' bewusst auf den Monatspreis zurück (statt
 *  zu brechen). null = Plan ohne Checkout (free). Pure → unit-testbar. */
export function pickLookupKey(plan: Pick<StudioPlan, 'lookupKey' | 'lookupKeyYearly'>, interval: WorkspaceBillingInterval): string | null {
  if (interval === 'yearly') return plan.lookupKeyYearly ?? plan.lookupKey
  return plan.lookupKey
}

/** Ist der Workspace auf einem BEZAHL-Plan (hat einen Stripe-lookupKey)? Basis
 *  für den Doppelabo-Schutz: ein bereits bezahltes Abo darf keinen zweiten
 *  Checkout starten (Wechsel läuft übers Stripe-Portal). Pure → unit-testbar. */
export function isPaidPlanKey(planKey: string | undefined | null, plans: StudioPlanCatalog): boolean {
  const plan = planKey ? plans[planKey] : undefined
  return !!plan?.lookupKey
}

export interface PlanGrantSet {
  siteProjectId: string
  /** Gewünschtes Entitlement-Set (requires-geschlossen, sortiert). */
  features: string[]
}

/** Plan-Key → gewünschte Grant-Sets für alle Sites eines Workspace.
 *  Deklarativ: der Aufrufer ERSETZT damit das Set je Site (wie die
 *  bestehende PUT-Logik) — kein Diff-Zustand in dieser Funktion. */
export function planToGrants(
  planKey: string,
  plans: StudioPlanCatalog,
  catalog: readonly Pick<FeatureCatalogEntry, 'key' | 'requires'>[],
  siteProjectIds: readonly string[],
): PlanGrantSet[] {
  const plan = plans[planKey]
  if (!plan) throw new Error(`Unbekannter Plan "${planKey}"`)
  const features = closeOverRequires(plan.features, catalog)
  return siteProjectIds.map(siteProjectId => ({ siteProjectId, features }))
}

/** Vom billing-Layer bereits VERIFIZIERTES Abo-Update (nie rohes
 *  Stripe-JSON — Signatur/Idempotenz gehören dem billing-Layer). Bewusst
 *  strukturell statt Import des billing-Typs: studio kennt billing nicht
 *  (A14) — die APP komponiert beide (Fulfillment-Plugin). */
export interface WorkspaceSubscriptionUpdate {
  /** Stripe-Statusraum (billing B3): active/trialing/past_due/canceled/… */
  status: string
  /** subscription_data.metadata aus dem Workspace-Checkout. */
  metadata: Record<string, string>
  /** Die Stripe-Subscription, auf die sich dieses Event bezieht — für den
   *  Cross-Sub-Guard (nur die aktuell hinterlegte Sub darf degradieren). */
  stripeSubscriptionId: string
}

/** Entscheidung des Fulfillment-Handlers — pure, damit die Policy ohne
 *  Stripe/Appwrite testbar ist. Kündigungs-Timing macht STRIPE selbst:
 *  cancel_at_period_end hält den Status bis zum Periodenende auf 'active',
 *  erst das echte Ende liefert 'canceled' → dann fällt der Workspace aufs
 *  free-Set zurück (NIE auf null Features — ein gekündigter Kunde ist nie
 *  schlechter gestellt als einer, der nie gezahlt hat). */
export type WorkspaceBillingAction =
  | { kind: 'ignore', reason: string }
  | { kind: 'apply-plan', workspaceId: string, plan: string, stripeSubscriptionId: string }
  | { kind: 'past-due', workspaceId: string }
  | { kind: 'free-fallback', workspaceId: string, stripeSubscriptionId: string }

export function subscriptionUpdateToAction(
  update: WorkspaceSubscriptionUpdate,
  plans: StudioPlanCatalog,
): WorkspaceBillingAction {
  const workspaceId = update.metadata.workspaceId
  if (!workspaceId) return { kind: 'ignore', reason: 'no-workspace-metadata' }

  switch (update.status) {
    case 'active':
    case 'trialing': {
      const plan = update.metadata.plan
      if (!plan || !plans[plan]) return { kind: 'ignore', reason: `unknown-plan-${plan ?? 'missing'}` }
      return { kind: 'apply-plan', workspaceId, plan, stripeSubscriptionId: update.stripeSubscriptionId }
    }
    case 'past_due':
    case 'unpaid':
      // Grants bleiben — Stripe-Dunning ist die Grace-Periode
      return { kind: 'past-due', workspaceId }
    case 'canceled':
    case 'incomplete_expired':
      return { kind: 'free-fallback', workspaceId, stripeSubscriptionId: update.stripeSubscriptionId }
    default:
      // incomplete (Checkout offen), paused, Unbekanntes → nichts anfassen
      return { kind: 'ignore', reason: `status-${update.status}` }
  }
}

/**
 * Cross-Sub-Guard (#6): darf die gekündigte Subscription den Workspace auf
 * `free` zurückstufen? NUR, wenn sie die aktuell hinterlegte ist — oder gar
 * keine hinterlegt ist (Legacy-Row / vor studio-009). Ist eine ANDERE,
 * neuere Sub hinterlegt, ist das Kündigen der alten stale und darf ein
 * frisch gekauftes Abo nicht kannibalisieren. Pure → unit-testbar.
 */
export function shouldApplyFreeFallback(storedSubscriptionId: string, canceledSubscriptionId: string): boolean {
  return storedSubscriptionId === '' || storedSubscriptionId === canceledSubscriptionId
}

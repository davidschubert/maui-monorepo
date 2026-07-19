import type { FeatureCatalogEntry } from './types/job'
import type { StudioPlanCatalog, WorkspaceStatus } from './types/workspace'

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

/** Vom billing-Layer bereits VERIFIZIERTES Abo-Ereignis (nie rohes
 *  Stripe-JSON — Signatur/Idempotenz gehören dem billing-Layer). */
export interface VerifiedSubscriptionEvent {
  type: 'subscription.active' | 'subscription.past_due' | 'subscription.canceled'
  /** Plan-Key aus der Checkout-Metadata; Pflicht bei subscription.active. */
  plan?: string
  /** Periodenende (ISO) — Basis für validUntil/graceUntil beim Auslaufen. */
  currentPeriodEnd?: string
}

export interface WorkspacePatch {
  plan?: string
  status: WorkspaceStatus
  /** Nur bei Kündigung gesetzt: ab wann die Entitlements auslaufen (F3). */
  validUntil?: string
  graceUntil?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Abo-Ereignis → Workspace-Patch. Kündigungen löschen NICHTS sofort:
 *  validUntil = Periodenende, graceUntil = +graceDays — die Sites werten
 *  das signierte Dokument selbst aus (featureGates, M8-Vorbereitung). */
export function subscriptionEventToWorkspacePatch(
  event: VerifiedSubscriptionEvent,
  options: { graceDays?: number } = {},
): WorkspacePatch {
  const graceDays = options.graceDays ?? 7
  switch (event.type) {
    case 'subscription.active': {
      if (!event.plan) throw new Error('subscription.active ohne plan-Metadata')
      return { plan: event.plan, status: 'active' }
    }
    case 'subscription.past_due':
      return { status: 'past_due' }
    case 'subscription.canceled': {
      if (!event.currentPeriodEnd) throw new Error('subscription.canceled ohne currentPeriodEnd')
      const end = new Date(event.currentPeriodEnd)
      if (Number.isNaN(end.getTime())) throw new Error(`Ungültiges currentPeriodEnd "${event.currentPeriodEnd}"`)
      return {
        status: 'canceled',
        validUntil: end.toISOString(),
        graceUntil: new Date(end.getTime() + graceDays * DAY_MS).toISOString(),
      }
    }
  }
}

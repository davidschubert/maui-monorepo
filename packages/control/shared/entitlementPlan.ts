import type { ProductCatalogEntry } from './types/job'
import type { ControlPlanCatalog } from './types/planCatalog'

/**
 * Lizenz-Mechanik der Studio-Seite, GEPARKT — die PUREN Bausteine.
 *
 * „Welche Produkte darf DIESE INSTALLATION betreiben?" (Control-Plane-Tabelle
 * `entitlements` + signierte Dokumente), NICHT „hat dieser Nutzer ein Abo?"
 * (das ist `packages/billing`). Ihr Rechnungs-Behälter war der Workspace, und
 * der ist mit A6 Schritt 5 weg — die Mechanik selbst bleibt bewusst stehen
 * (Davids A6-Entscheidung 3): sie ist der einzige Hebel, einem Kunden mit
 * EIGENER Installation Produkte freizugeben oder zu entziehen. Heute unbenutzt
 * (0 Zeilen `entitlements`), deshalb kostet sie nichts.
 *
 * Angewandt wird das hier Berechnete von `server/utils/entitlementGrants.ts`
 * (replaceSiteGrants, heute nur noch aus der manuellen Pflege
 * `websites/[id]/entitlements.put.ts`).
 */

/** Requires-Schluss über den Produkt-Katalog: gewählte Produkte plus alles,
 *  was sie transitiv voraussetzen. Unbekannte Keys sind ein Fehler — der
 *  Katalog ist die Autorität (F7), ein Tippfehler darf nie still ein
 *  leeres Grant-Set produzieren. */
export function closeOverRequires(
  products: readonly string[],
  catalog: readonly Pick<ProductCatalogEntry, 'key' | 'requires'>[],
): string[] {
  const byKey = new Map(catalog.map(entry => [entry.key, entry]))
  const result = new Set<string>()
  const queue = [...products]
  while (queue.length > 0) {
    const key = queue.pop()!
    if (result.has(key)) continue
    const entry = byKey.get(key)
    if (!entry) throw new Error(`Unbekanntes Produkt "${key}" (nicht im Katalog)`)
    result.add(key)
    queue.push(...entry.requires)
  }
  return [...result].sort()
}

export interface PlanGrantSet {
  siteProjectId: string
  /** Gewünschtes Entitlement-Set (requires-geschlossen, sortiert). */
  products: string[]
}

/** Plan-Key → gewünschte Grant-Sets für alle Sites einer Installation.
 *  Deklarativ: der Aufrufer ERSETZT damit das Set je Site (wie die
 *  bestehende PUT-Logik) — kein Diff-Zustand in dieser Funktion. */
export function planToGrants(
  planKey: string,
  plans: ControlPlanCatalog,
  catalog: readonly Pick<ProductCatalogEntry, 'key' | 'requires'>[],
  siteProjectIds: readonly string[],
): PlanGrantSet[] {
  const plan = plans[planKey]
  if (!plan) throw new Error(`Unbekannter Plan "${planKey}"`)
  const products = closeOverRequires(plan.products, catalog)
  return siteProjectIds.map(siteProjectId => ({ siteProjectId, products }))
}

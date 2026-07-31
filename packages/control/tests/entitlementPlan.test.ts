import { describe, expect, it } from 'vitest'
import { closeOverRequires, planToGrants } from '../shared/entitlementPlan'
import type { ControlPlanCatalog } from '../shared/types/planCatalog'

/**
 * Lizenz-Mechanik der Studio-Seite, GEPARKT (Davids A6-Entscheidung 3).
 *
 * Die Fälle standen bis A6 Schritt 5 in workspace-billing.test.ts. Der
 * Workspace war ihr Rechnungs-Behälter, nicht ihr Gegenstand: was hier geprüft
 * wird, ist der requires-Schluss über den Produkt-Katalog — die Frage „welche
 * Produkte darf diese INSTALLATION betreiben?". Die Tests bleiben, damit die
 * geparkte Mechanik beim ersten Studio-Kunden nicht ungeprüft aufwacht.
 */

const CATALOG = [
  { key: 'comments', requires: ['moderation'] },
  { key: 'moderation', requires: [] },
  { key: 'posts', requires: ['moderation'] },
  { key: 'events', requires: [] },
  { key: 'activity', requires: [] },
]

const PLANS: ControlPlanCatalog = {
  basic: { lookupKey: null, products: ['comments'] },
  pro: { lookupKey: 'workspace_pro_monthly', lookupKeyYearly: 'workspace_pro_yearly', products: ['comments', 'posts', 'events'] },
}

describe('closeOverRequires', () => {
  it('schließt transitiv über requires und sortiert', () => {
    expect(closeOverRequires(['comments'], CATALOG)).toEqual(['comments', 'moderation'])
    expect(closeOverRequires(['posts', 'events'], CATALOG)).toEqual(['events', 'moderation', 'posts'])
  })

  it('dedupliziert bei mehrfachen requires auf dasselbe Produkt', () => {
    expect(closeOverRequires(['comments', 'posts'], CATALOG)).toEqual(['comments', 'moderation', 'posts'])
  })

  it('wirft bei unbekanntem Produkt statt still zu verschlucken', () => {
    expect(() => closeOverRequires(['tippfehler'], CATALOG)).toThrow(/Unbekanntes Produkt "tippfehler"/)
  })

  it('leeres Set bleibt leer', () => {
    expect(closeOverRequires([], CATALOG)).toEqual([])
  })
})

describe('planToGrants', () => {
  it('liefert das requires-geschlossene Set für jede Site', () => {
    const grants = planToGrants('pro', PLANS, CATALOG, ['site-a', 'site-b'])
    expect(grants).toEqual([
      { siteProjectId: 'site-a', products: ['comments', 'events', 'moderation', 'posts'] },
      { siteProjectId: 'site-b', products: ['comments', 'events', 'moderation', 'posts'] },
    ])
  })

  it('wirft bei unbekanntem Plan', () => {
    expect(() => planToGrants('enterprise', PLANS, CATALOG, ['site-a'])).toThrow(/Unbekannter Plan "enterprise"/)
  })

  it('Installation ohne Sites → keine Grants, kein Fehler', () => {
    expect(planToGrants('basic', PLANS, CATALOG, [])).toEqual([])
  })
})

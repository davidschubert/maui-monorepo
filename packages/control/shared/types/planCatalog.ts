/**
 * Der PLAN-KATALOG des Control Plane — die Typen zu `pukalani.control.plans`.
 *
 * Die Datei hieß bis A6 Schritt 5 `types/workspace.ts` und trug daneben die
 * Row-Typen der `workspaces`-Tabelle. Die Tabelle ist weg (die Community ist
 * das zahlende Objekt, Davids Entscheidung 2026-07-30), der Katalog bleibt:
 * er beschrieb schon immer die Preise, die ein KUNDE zahlt (P4: Personal 29 €,
 * Pro 149 €) — nur sein Rechnungs-Behälter war der Workspace.
 *
 * Die Stripe-`lookup_key`s heißen weiterhin `workspace_personal_monthly` &c.
 * Das ist Absicht: sie sind IDENTITÄTEN bei Stripe (scripts/stripe/
 * ensure-prices.mjs, Test- UND Live-Mode). Ein Umbenennen im Code fände die
 * angelegten Preise nicht mehr — der Name ist hier ein Schlüssel, kein Wort.
 */

/** Ein Plan im Code-Katalog `pukalani.control.plans`. */
export interface ControlPlan {
  /** Stripe-lookup_key des MONATS-Preises (Muster des billing-Layers: Test-/
   *  Live-Mode wechseln ohne Codeänderung, Auflösung via resolvePriceByLookupKey);
   *  null = kostenloser Plan ohne Checkout. */
  lookupKey: string | null
  /** Optionaler lookup_key des JAHRES-Preises (gleicher Plan, anderes Intervall).
   *  Fehlt er, gibt es für diesen Plan nur das Monats-Abo. */
  lookupKeyYearly?: string | null
  /** Produkt-Keys, die der Plan gewährt (VOR requires-Schluss). */
  products: string[]
}

/** Abrechnungsintervall eines Abos. Bewusst control-eigen (A14: control hängt
 *  nicht am billing-Layer) — eigener Name vermeidet die Nuxt-Auto-Import-
 *  Kollision mit billing/BillingInterval. */
export type PlanBillingInterval = 'monthly' | 'yearly'

export type ControlPlanCatalog = Record<string, ControlPlan>

import type { Models } from 'node-appwrite'

/**
 * Entitlements (M6-T3, F3-Vorstufe): Row pro Site×Produkt im Control-Projekt —
 * das Control Plane führt, WELCHE Produkte einer Site zustehen. Bewusst OHNE
 * Signatur/Ablauf/Plan (kommt mit M8/Stripe als signiertes Dokument, das die
 * Sites konsumieren); bis dahin ist das die manuell gepflegte Wahrheit.
 * Row existiert = Produkt zugeteilt; `status` ist Vorwärts-Kompatibilität
 * (M8: suspended/Grace), heute wird nur 'active' geschrieben.
 */

export const ENTITLEMENT_STATUSES = ['active', 'suspended'] as const
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number]

/** Row-Typ zur `entitlements`-Table (Schema: Migration control-003). */
export interface EntitlementRow extends Models.Row {
  /** Appwrite-Projekt-ID der Site — die unveränderliche Identität (F6). */
  siteProjectId: string
  /** Produkt-Key (= Layer-Name = Entitlement-Key, F1/F7). */
  productKey: string
  /** Übergang bis zum Zusammenziehen (E11): alte Spalte (required + Unique-
   *  Index idx_site_feature) — Inserts MÜSSEN sie weiter befüllen, sonst 400.
   *  Fällt mit der Aufräum-Migration weg. */
  featureKey?: string
  status: EntitlementStatus
  notes: string
}

export const ENTITLEMENTS_TABLE = 'entitlements'

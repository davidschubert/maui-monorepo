import type { Models } from 'node-appwrite'

/**
 * Workspaces (M8): ein Workspace = ein zahlender Kunde des Control Plane
 * (heute der Betreiber selbst, Horizont 2: Agentur-Kunden). Sites hängen
 * über `sites.workspaceId` an genau einem Workspace; `null` = impliziter
 * Betreiber-Workspace (verhält sich wie vor M8 — volle manuelle Grants).
 *
 * GDPR-Hinweis: `ownerEmail` ist personenbezogen. Der UserDataContributor
 * folgt mit M9/Self-Service, wenn Workspace-Owner echte Studio-User werden —
 * bis dahin ist die Löschung ein manueller Betreiber-Vorgang (Row löschen).
 */

export const WORKSPACE_STATUSES = ['active', 'past_due', 'canceled'] as const
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number]

/** Row-Typ zur `workspaces`-Table (Schema: Migration studio-005). */
export interface WorkspaceRow extends Models.Row {
  name: string
  ownerEmail: string
  /** Stripe-Customer, sobald der erste Checkout lief; bis dahin ''. */
  stripeCustomerId: string
  /** Plan-Key aus `maui.studio.plans` (Code-Katalog, kein Table). */
  plan: string
  status: WorkspaceStatus
}

export const WORKSPACES_TABLE = 'workspaces'

/** Ein Plan im Code-Katalog `maui.studio.plans`. */
export interface StudioPlan {
  /** Stripe-Price-ID (aus server-only Env); null = kostenloser Plan ohne Checkout. */
  stripePriceId: string | null
  /** Feature-Keys, die der Plan gewährt (VOR requires-Schluss). */
  features: string[]
}

export type StudioPlanCatalog = Record<string, StudioPlan>

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
  /** AKTUELL gültige Stripe-Subscription (Migration studio-009). Basis des
   *  Cross-Sub-Guards: nur ihre Kündigung darf den Workspace auf free
   *  zurückstufen. '' = kein Abo / Legacy-Row. */
  stripeSubscriptionId: string
  /** Plan-Key aus `maui.studio.plans` (Code-Katalog, kein Table). */
  plan: string
  status: WorkspaceStatus
}

export const WORKSPACES_TABLE = 'workspaces'

/** Mitgliedschaft User↔Workspace (M9, Migration studio-007) — Membership
 *  IST die Berechtigung des Kundenbereichs (/workspace); v1 nur 'owner'. */
export const WORKSPACE_MEMBER_ROLES = ['owner'] as const
export type WorkspaceMemberRole = (typeof WORKSPACE_MEMBER_ROLES)[number]

export interface WorkspaceMemberRow extends Models.Row {
  workspaceId: string
  userId: string
  role: WorkspaceMemberRole
}

export const WORKSPACE_MEMBERS_TABLE = 'workspace_members'

/** Einmalige Owner-Einladung (M9, Migration studio-008) — DB hält nur den
 *  SHA-256-Hash des Tokens; der Klartext steht allein im Mail-Link. */
export const WORKSPACE_INVITE_STATUSES = ['pending', 'accepted'] as const
export type WorkspaceInviteStatus = (typeof WORKSPACE_INVITE_STATUSES)[number]

export interface WorkspaceInviteRow extends Models.Row {
  workspaceId: string
  email: string
  tokenHash: string
  status: WorkspaceInviteStatus
  expiresAt: string
  /** userId nach Annahme; bis dahin ''. */
  acceptedBy: string
}

export const WORKSPACE_INVITES_TABLE = 'workspace_invites'

/** Ein Plan im Code-Katalog `maui.studio.plans`. */
export interface StudioPlan {
  /** Stripe-lookup_key des MONATS-Preises (Muster des billing-Layers: Test-/
   *  Live-Mode wechseln ohne Codeänderung, Auflösung via resolvePriceByLookupKey);
   *  null = kostenloser Plan ohne Checkout. */
  lookupKey: string | null
  /** Optionaler lookup_key des JAHRES-Preises (gleicher Plan, anderes Intervall).
   *  Fehlt er, gibt es für diesen Plan nur das Monats-Abo. */
  lookupKeyYearly?: string | null
  /** Feature-Keys, die der Plan gewährt (VOR requires-Schluss). */
  features: string[]
}

/** Abrechnungsintervall eines Workspace-Abos. Bewusst studio-eigen (A14:
 *  studio hängt nicht am billing-Layer) — eigener Name vermeidet die
 *  Nuxt-Auto-Import-Kollision mit billing/BillingInterval. */
export type WorkspaceBillingInterval = 'monthly' | 'yearly'

export type StudioPlanCatalog = Record<string, StudioPlan>

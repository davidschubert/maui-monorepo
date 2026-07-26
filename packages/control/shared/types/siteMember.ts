import type { Models } from 'node-appwrite'

/**
 * G1 site_members-Register (studio-015): die Rollen-Mitgliedschaft EINER
 * Kunden-Community-Site. Lebt im Control Plane (studio), wird aber von der
 * Runtime (Platform-/Silo-App) über den read-only-Cross-Projekt-Key gelesen
 * (requireTenantPermission) — analog zum tenants-Resolver.
 *
 * Anker-Tripel: {siteId = tenants.$id, runtimeProjectId, runtimeUserId}. Die
 * Runtime-Identität (der Appwrite-User IM Pool-/Silo-Projekt) ist bewusst NICHT
 * die Control-Plane-userId — derselbe Mensch kann in mehreren Sites verschiedene
 * Runtime-User + verschiedene Rollen haben. Unique-Index uq_member erzwingt
 * genau EINE Rolle je Tripel.
 *
 * Die 5 Rollen sind hier eigenständig (self-contained Layer-Typ, wie im Repo
 * üblich). Die AUTORITÄT über Rolle→Capabilities liegt in
 * packages/core/shared/tenantAuthz.ts (TENANT_ROLE_CAPABILITIES); dessen
 * TENANT_ROLES muss identisch bleiben. Der Cross-Check dagegen läuft in
 * requireTenantPermission (G1-3) + Unit-Tests.
 */
export const SITE_ROLES = ['owner', 'admin', 'moderator', 'editor', 'viewer'] as const
export type SiteRole = (typeof SITE_ROLES)[number]

export const SITE_MEMBER_STATUSES = ['active', 'invited', 'suspended'] as const
export type SiteMemberStatus = (typeof SITE_MEMBER_STATUSES)[number]

export interface SiteMemberRow extends Models.Row {
  /** = tenants.$id (die kanonische Kunden-Site). */
  siteId: string
  /** Appwrite-Projekt, in dem der Runtime-User existiert (Pool: geteilt). */
  runtimeProjectId: string
  /** Der Appwrite-User IM Runtime-Projekt — NICHT die Control-Plane-userId. */
  runtimeUserId: string
  role: SiteRole
  status: SiteMemberStatus
  /** Nur für Einladung/Anzeige — NIE Autorisierungsschlüssel. */
  email: string
}

export const SITE_MEMBERS_TABLE = 'site_members'

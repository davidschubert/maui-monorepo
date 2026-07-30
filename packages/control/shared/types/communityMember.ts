import type { Models } from 'node-appwrite'

/**
 * G1 community_members-Register (control-015): die Rollen-Mitgliedschaft EINER
 * Kunden-Community-Site. Lebt im Control Plane (studio), wird aber von der
 * Runtime (Platform-/Silo-App) über den read-only-Cross-Projekt-Key gelesen
 * (requireTenantPermission) — analog zum tenants-Resolver.
 *
 * Anker-Tripel: {communityId = tenants.$id, runtimeProjectId, runtimeUserId}. Die
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

/**
 * Status einer Mitgliedschaft.
 *
 * `removed` kam mit der Mitglieder-Verwaltung (control-019, Davids Entscheidung 1
 * vom 2026-07-29) dazu und ist der wichtigste Wert dieser Liste: „Entfernen"
 * LÖSCHT die Row NICHT, es entzieht nur den Zugang (der Resolver lässt allein
 * `active` durch, und die Runtime zieht zusätzlich das Site-Label — A5). Die Row
 * bleibt als POSITIVE Tatsache stehen: nur so kann eine Ansicht „Ehemaliges
 * Mitglied" hinter einen Autorennamen setzen, und nur so kann `members/join`
 * einen entzogenen Zugang vom nächsten Beitritts-Auslöser unterscheiden.
 *
 * Die Abwesenheit einer Row bedeutet ausdrücklich NICHT „ehemalig". Seit A5
 * (2026-07-29) trägt `community_members` JEDES Mitglied — Gründer, Eingeladene UND
 * Beigetretene —, aber eben nur, wer je beigetreten ist: Gast-Kommentare, Konten
 * aus einer anderen Community und alles vor A5 haben keine Zeile. „Ehemalig"
 * bleibt deshalb eine positive Tatsache (Row vorhanden + Zugang entzogen), keine
 * Schlussfolgerung aus einer Lücke.
 *
 * `invited` bleibt aus control-015 erhalten (Enum-Werte lassen sich nicht
 * entfernen), wird aber nicht mehr geschrieben: offene Einladungen leben in
 * `community_invites`, weil zur Einladungszeit noch keine runtimeUserId existiert.
 */
export const COMMUNITY_MEMBER_STATUSES = ['active', 'invited', 'suspended', 'removed'] as const
export type CommunityMemberStatus = (typeof COMMUNITY_MEMBER_STATUSES)[number]

export interface CommunityMemberRow extends Models.Row {
  /** = tenants.$id (die kanonische Kunden-Site). */
  communityId: string
  /** Appwrite-Projekt, in dem der Runtime-User existiert (Pool: geteilt). */
  runtimeProjectId: string
  /** Der Appwrite-User IM Runtime-Projekt — NICHT die Control-Plane-userId. */
  runtimeUserId: string
  role: SiteRole
  status: CommunityMemberStatus
  /** Nur für Einladung/Anzeige — NIE Autorisierungsschlüssel. */
  email: string
  /** Zeitpunkt des Zugangs-Entzugs (control-019); null = nie entfernt. */
  removedAt?: string | null
}

export const COMMUNITY_MEMBERS_TABLE = 'community_members'

/** Type-Guard: bekannter Mitglieds-Status? (fremde/verfälschte Werte fallen weg) */
export function isCommunityMemberStatus(value: string): value is CommunityMemberStatus {
  return (COMMUNITY_MEMBER_STATUSES as readonly string[]).includes(value)
}

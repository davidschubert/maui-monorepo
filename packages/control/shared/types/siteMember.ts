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

/**
 * Status einer Mitgliedschaft.
 *
 * `removed` kam mit der Mitglieder-Verwaltung (studio-019, Davids Entscheidung 1
 * vom 2026-07-29) dazu und ist der wichtigste Wert dieser Liste: „Entfernen"
 * LÖSCHT die Row NICHT, es entzieht nur den Zugang (der Resolver lässt allein
 * `active` durch). Die Row bleibt als POSITIVE Tatsache stehen — nur so kann
 * eine Ansicht später „Ehemaliges Mitglied" hinter einen Autorennamen setzen.
 *
 * Die Abwesenheit einer Row bedeutet ausdrücklich NICHT „ehemalig": in einer
 * Pool-Community trägt `site_members` heute nur das TEAM (Gründer + Eingeladene),
 * nicht jede mitlesende Person (CLAUDE.md, A4). Wer „nicht in site_members" als
 * „ehemalig" läse, würde fast jeden Kommentar-Autor falsch kennzeichnen.
 *
 * `invited` bleibt aus studio-015 erhalten (Enum-Werte lassen sich nicht
 * entfernen), wird aber nicht mehr geschrieben: offene Einladungen leben in
 * `site_invites`, weil zur Einladungszeit noch keine runtimeUserId existiert.
 */
export const SITE_MEMBER_STATUSES = ['active', 'invited', 'suspended', 'removed'] as const
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
  /** Zeitpunkt des Zugangs-Entzugs (studio-019); null = nie entfernt. */
  removedAt?: string | null
}

export const SITE_MEMBERS_TABLE = 'site_members'

/** Type-Guard: bekannter Mitglieds-Status? (fremde/verfälschte Werte fallen weg) */
export function isSiteMemberStatus(value: string): value is SiteMemberStatus {
  return (SITE_MEMBER_STATUSES as readonly string[]).includes(value)
}

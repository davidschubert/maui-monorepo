import type { H3Event } from 'h3'
import type { Capability } from '../../shared/types/authz'
import type { CurrentUser } from '../../shared/types/appwrite'
import { isTenantRole, tenantRoleHasCapability, type TenantRole } from '../../shared/tenantAuthz'

/**
 * G1 — Autorisierung INNERHALB einer Kunden-Community-Site (die 5 Site-Rollen
 * aus tenantAuthz.ts). Getrennt von requirePermission (Operator-RBAC über
 * User-Labels), das für Betreiber-/Single-Tenant-Routen bleibt.
 *
 * Zwei bewusst getrennte Identitätswelten (docs/plans/G0-PRODUKTVERTRAG.md §2):
 *  - Operator: globale Appwrite-Labels auf DEINER Instanz → requirePermission.
 *  - Site-Mitglied: eine Rolle in site_members, verankert an der Runtime-
 *    Identität {siteId = tenants.$id, runtimeProjectId, runtimeUserId}.
 *
 * Die Site-Rollen-Mitgliedschaft lebt im Control Plane (studio), der prüfende
 * Request aber in einem ANDEREN Projekt (Pool/Silo). Deshalb liest ein von der
 * App registrierter Resolver sie cross-Projekt (read-only-Key) — analog zum
 * tenants-Resolver (A14: core kennt die Tabelle nicht). Der Resolver cacht
 * kurz (≤60 s → Revoke ≤60 s); NIE eine Session-tragende Antwort dauerhaft.
 */

export interface SiteMemberLookup {
  /** = tenants.$id (die kanonische Kunden-Site). */
  siteId: string
  /** Appwrite-Projekt, in dem der Runtime-User existiert (Pool: geteilt). */
  runtimeProjectId: string
  /** Der Appwrite-User IM Runtime-Projekt (event.context.user.$id). */
  runtimeUserId: string
}

/**
 * App-registrierte Auflösung {Site, Runtime-User} → Rollen-String einer AKTIVEN
 * Mitgliedschaft (oder null = keine). Der String wird hier gegen isTenantRole
 * validiert — eine unbekannte/verfälschte Rolle gilt als „keine Rolle".
 */
export type SiteRoleResolver = (
  lookup: SiteMemberLookup,
) => Promise<string | null> | string | null

let siteRoleResolver: SiteRoleResolver | null = null

/** Von der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerSiteRoleResolver(fn: SiteRoleResolver): void {
  if (siteRoleResolver) {
    console.warn('[core] registerSiteRoleResolver: bestehender Resolver wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  siteRoleResolver = fn
}

export function getSiteRoleResolver(): SiteRoleResolver | null {
  return siteRoleResolver
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetSiteRoleResolver(): void {
  siteRoleResolver = null
}

/**
 * Die Site-Rolle des aktuellen Requests (oder null). Fail-closed: ohne
 * eingeloggten Runtime-User, ohne Tenant-Kontext, ohne siteId oder ohne
 * registrierten Resolver gibt es KEINE Rolle. Eine unbekannte gespeicherte
 * Rolle wird verworfen (Cross-Check gegen den core-Rollenkatalog).
 */
export async function resolveTenantRole(event: H3Event): Promise<TenantRole | null> {
  const user = event.context.user
  const tenant = event.context.tenant
  if (!user?.$id || !tenant?.siteId) return null

  const resolver = getSiteRoleResolver()
  if (!resolver) return null

  const role = await resolver({
    siteId: tenant.siteId,
    runtimeProjectId: tenant.projectId,
    runtimeUserId: user.$id,
  })
  return role && isTenantRole(role) ? role : null
}

/**
 * Serverseitiger Site-Capability-Gate. 401 ohne Login, sonst 403 wenn der
 * Runtime-User keine (ausreichende) Rolle auf DIESER Site hat. Gibt bei Erfolg
 * User + aufgelöste Rolle zurück (für rollenabhängige Weiterverarbeitung).
 */
export async function requireTenantPermission(
  event: H3Event,
  capability: Capability,
): Promise<{ user: CurrentUser, role: TenantRole }> {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const role = await resolveTenantRole(event)
  if (!role || !tenantRoleHasCapability(role, capability)) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  return { user, role }
}

import type { H3Event } from 'h3'
import type { Capability } from '../../shared/types/authz'
import type { CurrentUser } from '../../shared/types/appwrite'
import { decideCommunityAccess } from '../../shared/communityAccess'
import { isCommunityRole, type CommunityRole } from '../../shared/communityAuthz'

/**
 * DER EINE WÄCHTER für community-bezogene Routen (O5/G1) — Inhalte, Moderation
 * und Verwaltung EINER Community.
 *
 * ── WARUM ES NUR NOCH EINEN GIBT (E8 Etappe 4, 2026-07-30) ──────────────────
 * Bis hierher standen zwei fast gleich heißende Wächter nebeneinander:
 * `requireTenantPermission` (nur Rolle) und `requireSitePermission` (Rolle plus
 * protokollierter Operator-Break-Glass). Beide async, beide mit demselben
 * Aufrufmuster, beide einen Tippfehler voneinander entfernt — und weil ein
 * nicht-abgewartetes Promise wahrheitswertig ist, hätte ein vergessenes `await`
 * an der falschen der beiden Stellen still fail-OPEN bedeutet. Der tote Zwilling
 * (`requireTenantPermission` hatte zuletzt KEINEN echten Aufrufer mehr) ist
 * ersatzlos gefallen; der lebende heißt jetzt so wie die Sache, die er schützt.
 * Was hier bleibt, ist alles, was noch Aufrufer hat: die Rollen-Auflösung, die
 * Resolver-Registry und der Gate selbst — an EINER Stelle.
 *
 * `requirePermission` bleibt für alles, was der ganzen INSTANZ gehört
 * (app_config, Themes-Katalog, Nutzerverwaltung, Audit): dort ist ein globales
 * Label die richtige Autorität, und ein Kunden-Owner hat keines — solche Routen
 * sind für ihn also schon heute geschlossen und bleiben es.
 *
 * ── DIE ZWEI IDENTITÄTSWELTEN (docs/referenz/G0-PRODUKTVERTRAG.md §2) ───────
 *  - Operator: globale Appwrite-Labels auf DEINER Instanz → requirePermission.
 *  - Community-Mitglied: eine Rolle in `community_members`, verankert an der
 *    Runtime-Identität {communityId = tenants.$id, runtimeProjectId,
 *    runtimeUserId} — NICHT an der Control-Plane-userId.
 *
 * Die Mitgliedschaft lebt im Control Plane (control), der prüfende Request aber
 * in einem ANDEREN Projekt (Pool/Silo). Deshalb liest ein von der App
 * registrierter Resolver sie cross-Projekt (read-only-Key) — analog zum
 * tenants-Resolver (A14: core kennt die Tabelle nicht). Der Resolver cacht kurz
 * (≤60 s → Revoke ≤60 s); NIE eine Session-tragende Antwort dauerhaft.
 */

export interface CommunityMemberLookup {
  /** = tenants.$id (die kanonische Kunden-Community). */
  communityId: string
  /** Appwrite-Projekt, in dem der Runtime-User existiert (Pool: geteilt). */
  runtimeProjectId: string
  /** Der Appwrite-User IM Runtime-Projekt (event.context.user.$id). */
  runtimeUserId: string
}

/**
 * App-registrierte Auflösung {Community, Runtime-User} → Rollen-String einer
 * AKTIVEN Mitgliedschaft (oder null = keine). Der String wird hier gegen
 * isCommunityRole validiert — eine unbekannte/verfälschte Rolle gilt als
 * „keine Rolle".
 */
export type CommunityRoleResolver = (
  lookup: CommunityMemberLookup,
) => Promise<string | null> | string | null

let communityRoleResolver: CommunityRoleResolver | null = null

/** Von der App (Nitro-Plugin) registriert — EINE Autorität pro Deployment. */
export function registerCommunityRoleResolver(fn: CommunityRoleResolver): void {
  if (communityRoleResolver) {
    console.warn('[core] registerCommunityRoleResolver: bestehender Resolver wird ersetzt — pro Deployment ist EINE Autorität vorgesehen')
  }
  communityRoleResolver = fn
}

export function getCommunityRoleResolver(): CommunityRoleResolver | null {
  return communityRoleResolver
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetCommunityRoleResolver(): void {
  communityRoleResolver = null
}

/**
 * Die Community-Rolle des aktuellen Requests (oder null). Fail-closed: ohne
 * eingeloggten Runtime-User, ohne Mandanten-Kontext, ohne communityId oder ohne
 * registrierten Resolver gibt es KEINE Rolle. Eine unbekannte gespeicherte
 * Rolle wird verworfen (Cross-Check gegen den core-Rollenkatalog).
 */
export async function resolveCommunityRole(event: H3Event): Promise<CommunityRole | null> {
  const user = event.context.user
  const tenant = event.context.tenant
  if (!user?.$id || !tenant?.communityId) return null

  const resolver = getCommunityRoleResolver()
  if (!resolver) return null

  const role = await resolver({
    communityId: tenant.communityId,
    runtimeProjectId: tenant.projectId,
    runtimeUserId: user.$id,
  })
  return role && isCommunityRole(role) ? role : null
}

/**
 * Serverseitiger Community-Capability-Gate. 401 ohne Login, sonst 403 wenn der
 * Runtime-User weder eine ausreichende Rolle in DIESER Community noch das
 * Operator-Break-Glass hat. Der Break-Glass wird protokolliert: die G1-Zusage
 * ist „kein stiller Dauer-Bypass".
 *
 * MUSS awaited werden (die Rollen-Auflösung liest cross-Projekt).
 */
export async function requireCommunityPermission(
  event: H3Event,
  capability: Capability,
): Promise<{ user: CurrentUser, role: CommunityRole | null }> {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const tenant = event.context.tenant
  const tenantScoped = Boolean(tenant)
  const role = tenantScoped ? await resolveCommunityRole(event) : null

  const decision = decideCommunityAccess({
    capability,
    labels: user.labels ?? [],
    tenantScoped,
    role,
  })

  if (!decision.allowed) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  if (decision.via === 'operator') {
    // Betreiber greift auf eine KUNDEN-Community zu. Das ist erlaubt (Support),
    // aber niemals unsichtbar — die Zeile ist der Audit-Trail.
    logEvent('warn', 'community.operator_access', {
      capability,
      communityId: tenant?.communityId ?? '',
      userId: user.$id,
      hasCommunityRole: Boolean(role),
    })
  }

  return { user, role }
}

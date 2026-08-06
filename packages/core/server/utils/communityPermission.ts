import type { H3Event } from 'h3'
import type { Capability } from '../../shared/types/authz'
import type { CurrentUser } from '../../shared/types/appwrite'
import {
  actorForCommunityAccess,
  decideCommunityAccess,
  isCommunityMember,
  type CommunityAccessVia,
} from '../../shared/communityAccess'
import { isCommunityRole, type CommunityRole } from '../../shared/communityAuthz'
import { trustLevelGrantsCapability } from '../../shared/trustLevel'

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
 * „Gehört dieser Request-Nutzer zu der Community DIESES Hosts?" (H1) — die
 * Zugehörigkeits-Frage ohne Capability.
 *
 * Fail-closed und OHNE eigenes catch: ein transienter Resolver-Fehler wirft,
 * genau wie in `requireCommunityPermission` daneben. Wer die Antwort nur als
 * Annehmlichkeit braucht (`ensureCommunityHandle`), fängt das bei sich ab; wer
 * eine Grenze zieht, soll bei Unklarheit NICHT durchlassen.
 *
 * Kostet im Normalfall nichts Zusätzliches: der Rollen-Resolver hat für diesen
 * Request längst geantwortet (Label-Middleware) und cacht 30 s.
 */
export async function resolveCommunityMembership(event: H3Event): Promise<boolean> {
  const user = event.context.user
  if (!user?.$id) return false

  const tenant = event.context.tenant
  // Die Grenze gibt es NUR im Pool. Silo, Kontroll-Host, Playground und
  // Single-Tenant-Betrieb laufen hier vorbei — dieselbe Ausnahme, die
  // `joinCommunity` und `06.community-label.ts` machen.
  const communityId = tenant?.mode === 'pool' ? (tenant.communityId ?? '') : ''
  if (!communityId) return true

  return isCommunityMember({
    tenantScoped: true,
    role: await resolveCommunityRole(event),
    hasCommunityLabel: (user.labels ?? []).includes(communityId),
    recentlyDenied: communityAccessRecentlyDenied(communityId, user.$id),
  })
}

/**
 * Dasselbe als WACHE. 401 ohne Login, 403 mit fachlichem Grund für Fremde.
 *
 * Der Grund reist als `data: { code: 'not_a_member' }` — der zentrale Handler
 * hebt ihn als `reason` ins Envelope. Ein nackter 403 wäre hier besonders
 * ärgerlich: „verboten" beantwortet nicht, ob man sich vertan hat oder ob man
 * schlicht woanders zuhause ist.
 */
export async function requireCommunityMembership(event: H3Event): Promise<CurrentUser> {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })
  if (!(await resolveCommunityMembership(event))) {
    throw createError({ status: 403, statusText: 'Not a member', data: { code: 'not_a_member' } })
  }
  return user
}

/**
 * Serverseitiger Community-Capability-Gate. 401 ohne Login, sonst 403 wenn der
 * Runtime-User weder eine ausreichende Rolle in DIESER Community noch das
 * Operator-Break-Glass hat. Der Break-Glass wird protokolliert: die G1-Zusage
 * ist „kein stiller Dauer-Bypass".
 *
 * MUSS awaited werden (die Rollen-Auflösung liest cross-Projekt).
 *
 * ── WER HANDELT? DIE ANTWORT KOMMT MIT (F17, 2026-08-01) ────────────────────
 * Der Gate weiß als Einziger, ob hier ein Mensch DIESER Community steht
 * (`via: 'role'`) oder der Betreiber im Break-Glass. Genau das ist die Frage,
 * die die Datentür seit C1c mit `actor` stellt — deshalb liefert der Gate sie
 * gleich mit, statt jede Redaktions-Route raten zu lassen:
 *
 *     const { actor } = await requireCommunityPermission(event, 'events.manage')
 *     const db = tenantDb(event, { as: 'operator', actor })
 *
 * Die Klinke bleibt dabei `'operator'` (die Tabellen tragen bewusst keine
 * User-Schreibrechte); `actor` sagt, dass die Inhalts-Sperre und der
 * Beitritts-Auslöser trotzdem für den Menschen gelten, der gerade tippt.
 * Die Regel selbst ist pur und getestet: `actorForCommunityAccess`.
 */
export async function requireCommunityPermission(
  event: H3Event,
  capability: Capability,
): Promise<{
  user: CurrentUser
  role: CommunityRole | null
  /** Auf welchem Weg der Zugriff erlaubt wurde (Rolle / Break-Glass / Silo). */
  via: CommunityAccessVia
  /** Der Handelnde für `tenantDb(event, { as: 'operator', actor })`. */
  actor: 'member' | 'operator'
}> {
  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const tenant = event.context.tenant
  const tenantScoped = Boolean(tenant)
  const role = tenantScoped ? await resolveCommunityRole(event) : null

  /**
   * DIE STUFE WIRD NUR GEFRAGT, WENN SIE ETWAS ÄNDERN KÖNNTE (F1 Teilpaket 3).
   *
   * `trustLevelGrantsCapability` ist eine statische Frage an die Matrix: kann
   * IRGENDEINE Stufe diese Capability verleihen? Heute sagen drei von 31 ja.
   * Ohne diesen Filter kostete jede geschützte Route eine zusätzliche Abfrage —
   * für eine Antwort, die in 90 % der Fälle gar nicht gelesen wird.
   *
   * Und die Reihenfolge ist ebenfalls Absicht: erst die Rolle. Wer schon über
   * sie durchkommt, hat trotzdem gefragt — das ist der Preis dafür, die
   * Entscheidung PUR zu halten (sie bekommt alle Eingaben, sie holt sich keine).
   * Bei drei betroffenen Capabilities ist das eine Abfrage an Routen, die
   * ohnehin schreiben.
   */
  const trustLevel = trustLevelGrantsCapability(capability) ? await resolveTrustLevel(event) : 0

  const decision = decideCommunityAccess({
    capability,
    labels: user.labels ?? [],
    tenantScoped,
    role,
    trustLevel,
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

  return { user, role, via: decision.via, actor: actorForCommunityAccess(decision.via) }
}

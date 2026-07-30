import { randomBytes } from 'node:crypto'
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { Capability } from '../../../core/shared/types/authz'
import { isTenantRole, tenantRoleHasCapability } from '../../../core/shared/tenantAuthz'
import { SITE_MEMBERS_TABLE, type SiteMemberRow, type SiteRole } from '../../shared/types/siteMember'
import { SITE_INVITES_TABLE, type SiteInviteRow } from '../../shared/types/siteInvite'
import { TENANTS_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import type { SiteTeamDecision, SiteTeamMemberFacts } from '../../shared/siteTeam'
import { verifyRuntimeIdentity, type RuntimeIdentity } from './onboardingService'
import { hashInviteToken } from './workspaceMembers'

/**
 * Der gemeinsame Vorraum ALLER Mitglieder-Routen des Control Plane.
 *
 * `site/registration.post.ts` hat dieselben vier Prüfungen noch einzeln
 * ausgeschrieben. Bei sieben Routen wäre das siebenmal dieselbe Kette — und die
 * eine, in der eine Prüfung fehlt, wäre das Leck. Deshalb genau EINE Funktion:
 *
 *  1. **Service-Secret** — prüft der Aufrufer schon vor dem Body
 *     (requireOnboardingCaller in der Route, damit 404/401 ohne jede Arbeit
 *     kommen).
 *  2. **JWT** — WER handelt. Das Control Plane prüft es SELBST gegen das
 *     Pool-Projekt; die Behauptung der Platform-App zählt nicht.
 *  3. **Site-Rolle** — der JWT-Inhaber hat die verlangte Capability GENAU auf
 *     dieser Site (site_members, status 'active'). Eine mitgeschickte fremde
 *     `siteId` ist damit harmlos: ohne Mitgliedschaft endet sie in 403.
 *  4. **Tenant ⇄ Projekt** — die Site gehört zu dem Projekt, gegen das das JWT
 *     geprüft wurde. Ohne diese Zeile könnte eine Mitgliedschafts-Row mit
 *     richtigem Projekt, aber fremder siteId auf einen anderen Tenant zeigen
 *     (404, damit sich eine fremde Id nicht bestätigt).
 *
 * Zurück kommt alles, was die Regeln danach brauchen: die eigene Mitgliedschaft
 * und ALLE Mitgliedschaften der Site (die Owner-Zählung braucht sie).
 */

export interface SiteTeamContext {
  identity: RuntimeIdentity
  tenant: TenantRow
  actor: SiteMemberRow
  actorRole: SiteRole
  members: SiteMemberRow[]
  databaseId: string
}

/**
 * Mitgliedschaften einer Site — ALLE, seitenweise.
 *
 * War bis A5 eine Abfrage mit `limit(200)`, und das war richtig, solange
 * `site_members` nur das Team trug (Gründer + Eingeladene). Seit Mitgliedschaft
 * ein Ereignis ist (jeder Beitritt legt eine Zeile an), ist 200 eine Grenze, die
 * eine wachsende Community erreicht — und ein abgeschnittenes Ende hätte hier
 * zwei hässliche Folgen: die Owner-Zählung („nicht der letzte Owner") stimmte
 * nicht mehr, und die Mitgliederliste zeigte still weniger als sie behauptet.
 *
 * Der Deckel bleibt, aber weit oben und SICHTBAR: Pool-Communities sind
 * Vereins-/Redaktionsgröße, nicht Twitter. Wer ihn erreicht, findet den Grund im
 * Log statt in einem stummen Fehlverhalten.
 */
const MEMBER_PAGE = 500
const MEMBER_CEILING = 10_000

export async function listSiteMembers(event: H3Event, siteId: string, projectId: string): Promise<SiteMemberRow[]> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const all: SiteMemberRow[] = []
  let cursor = ''
  while (all.length < MEMBER_CEILING) {
    const queries = [
      Query.equal('siteId', siteId),
      Query.equal('runtimeProjectId', projectId),
      Query.orderAsc('$createdAt'),
      Query.limit(MEMBER_PAGE),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ]
    const page: SiteMemberRow[] = await admin.tablesDB.listRows<SiteMemberRow>({
      databaseId, tableId: SITE_MEMBERS_TABLE, queries,
    }).then(res => res.rows).catch((error) => { throw toH3Error(error, 'Could not read site members') })

    all.push(...page)
    if (page.length < MEMBER_PAGE) return all
    cursor = page[page.length - 1]?.$id ?? ''
    if (!cursor) return all
  }

  logEvent('warn', 'site.members_truncated', { siteId, ceiling: MEMBER_CEILING })
  return all
}

/**
 * Die Mitgliedschaft EINES Runtime-Users auf EINER Site — gezielt, nicht aus der
 * Liste gefischt.
 *
 * Warum getrennt von listSiteMembers: die Autorisierung darf nicht davon
 * abhängen, wie viele Mitglieder eine Community hat. Vor A5 war der Handelnde
 * immer unter den ersten 200 Zeilen (nur das Team stand drin) — mit
 * beitretenden Mitgliedern hätte ein Admin einer großen Community irgendwann 403
 * bekommen, weil seine eigene Zeile hinter dem Seitenrand lag. Das ist die Sorte
 * Fehler, die erst beim erfolgreichen Kunden auftritt.
 */
export async function findSiteMember(
  event: H3Event,
  siteId: string,
  projectId: string,
  runtimeUserId: string,
): Promise<SiteMemberRow | null> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<SiteMemberRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: SITE_MEMBERS_TABLE,
    queries: [
      Query.equal('siteId', siteId),
      Query.equal('runtimeProjectId', projectId),
      Query.equal('runtimeUserId', runtimeUserId),
      Query.limit(1),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read site membership') })
  return rows[0] ?? null
}

/** Offene Einladungen einer Site (pending; abgelaufene filtert der Aufrufer). */
export async function listSiteInvites(event: H3Event, siteId: string): Promise<SiteInviteRow[]> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<SiteInviteRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: SITE_INVITES_TABLE,
    queries: [
      Query.equal('siteId', siteId),
      Query.equal('status', 'pending'),
      Query.orderDesc('$createdAt'),
      Query.limit(100),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read site invites') })
  return rows
}

export async function requireSiteTeamContext(
  event: H3Event,
  body: { jwt: string, siteId: string },
  capability: Capability,
): Promise<SiteTeamContext> {
  const identity = await verifyRuntimeIdentity(event, body.jwt)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId

  // GEZIELT, nicht aus der Liste: die Autorisierung darf nicht daran hängen, wie
  // viele Mitglieder eine Community hat (siehe findSiteMember).
  const own = await findSiteMember(event, body.siteId, identity.projectId, identity.userId)
  const actor = own?.status === 'active' ? own : null
  const role = actor?.role

  if (!actor || !role || !isTenantRole(role) || !tenantRoleHasCapability(role, capability)) {
    logEvent('warn', 'site.team_denied', {
      siteId: body.siteId,
      runtimeUserId: identity.userId,
      capability,
      role: role ?? '',
    })
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  const admin = createAdminClient(event)
  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: TENANTS_TABLE, rowId: body.siteId,
  }).catch(() => null)
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  // ALLE Mitgliedschaften — die Regeln brauchen sie (Owner-Zählung) und die
  // Liste zeigt sie. Erst NACH der Autorisierung: wer nichts darf, soll auch
  // nichts lesen lassen.
  const members = await listSiteMembers(event, body.siteId, identity.projectId)

  return { identity, tenant, actor, actorRole: role, members, databaseId }
}

/** Row → die Fakten, mit denen die PUREN Regeln arbeiten. */
export function memberFacts(row: SiteMemberRow): SiteTeamMemberFacts {
  return { id: row.$id, runtimeUserId: row.runtimeUserId, role: row.role, status: row.status }
}

/**
 * Eine abgelehnte Regel in eine Antwort verwandeln. 409 statt 403, weil hier
 * nicht die BERECHTIGUNG fehlt (die wurde gerade geprüft), sondern der Zustand
 * widerspricht — und der Grund reist als Code mit, damit die UI ihn übersetzen
 * kann, statt „Fehler" zu sagen.
 */
export function throwOnDenied(decision: SiteTeamDecision, context: Record<string, unknown>): void {
  if (decision.ok) return
  logEvent('info', 'site.team_rule_denied', { ...context, reason: decision.reason })
  throw createError({
    status: 409,
    statusText: 'Rejected by team rule',
    data: { code: decision.reason },
  })
}

/**
 * Ein Einladungs-Token: Klartext NUR für den Mail-Link, Hash für die DB.
 * Gehasht wird mit demselben Helfer wie die Workspace-Einladungen
 * (`hashInviteToken`, workspaceMembers.ts) — ein zweites Hash-Verfahren wäre
 * eine zweite Stelle, an der man sich vertun kann.
 */
export function createSiteInviteToken(): { token: string, tokenHash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashInviteToken(token) }
}

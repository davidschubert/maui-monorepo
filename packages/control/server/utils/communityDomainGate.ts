/**
 * DIE TÜR VOR DEN VIER DOMAIN-ROUTEN des Control Plane.
 *
 * Sie prüft dasselbe wie `community/branding.post.ts` — und weil das dort
 * inzwischen zum vierten Mal wörtlich abgeschrieben dasteht, steht es hier
 * EINMAL. Vier Kopien wären vier Gelegenheiten, dass eine davon eine Prüfung
 * verliert; und die Prüfung, die man hier verliert, gibt einem Fremden die
 * Adresse einer Community.
 *
 * VIER unabhängige Fragen, alle müssen ja sein:
 *
 *  1. **Service-Secret** — der Aufrufer ist unser eigenes Deployment
 *     (`requireOnboardingCaller`, an der Route). 404 ohne Secret, 401 falsch.
 *  2. **JWT** — WER handelt. Vom Control Plane SELBST gegen das Pool-Projekt
 *     geprüft; eine Identitätsbehauptung der Platform-App gilt nicht.
 *  3. **Site-Rolle** — der JWT-Inhaber ist OWNER genau dieser Community
 *     (`community.domain`; die Capability trägt nur die Owner-Rolle). Eine
 *     mitgeschickte fremde `communityId` ist damit harmlos: ohne
 *     Mitgliedschaft endet sie in 403.
 *  4. **Plan** — Davids Entscheidung 1: eigene Domains ab **Pro**. Geprüft
 *     wird hier und nicht nur in der Runtime-Route: die Platform-App gatet
 *     über ihre `app.config`, das Control Plane über die ZEILE. Wer nur der
 *     UI-Sichtbarkeit vertraut, verkauft ein Pro-Merkmal an jeden, der die
 *     Route direkt aufruft.
 *
 * BEWUSSTE HÄRTE, wie bei branding.post.ts: der Operator-Break-Glass reicht
 * hier NICHT durch. Die Platform-App ließe einen Betreiber mit globalem Label
 * passieren (protokolliert), das Control Plane verlangt eine echte
 * `community_members`-Zeile. Das Control Plane glaubt dem Aufrufer nichts,
 * auch nicht seine Betreiber-Eigenschaft.
 */
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { communityRoleHasCapability, isCommunityRole } from '../../../core/shared/communityAuthz'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { customDomainAllowedForPlan } from '../../shared/customDomain'
import { verifyRuntimeIdentity, type RuntimeIdentity } from './onboardingService'

export interface CommunityDomainContext {
  identity: RuntimeIdentity
  row: TenantRow
  databaseId: string
}

export async function requireCommunityDomainOwner(
  event: H3Event,
  body: { jwt: string, communityId: string },
  options: { requirePlan?: boolean } = {},
): Promise<CommunityDomainContext> {
  const identity = await verifyRuntimeIdentity(event, body.jwt)
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const { rows: memberships } = await admin.tablesDB.listRows<CommunityMemberRow>({
    databaseId,
    tableId: COMMUNITY_MEMBERS_TABLE,
    queries: [
      Query.equal('communityId', body.communityId),
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.equal('status', 'active'),
      Query.limit(1),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read community membership') })

  const role = memberships[0]?.role
  if (!role || !isCommunityRole(role) || !communityRoleHasCapability(role, 'community.domain')) {
    logEvent('warn', 'community.custom_domain_denied', {
      communityId: body.communityId,
      runtimeUserId: identity.userId,
      role: role ?? '',
    })
    throw createError({ status: 403, statusText: 'Forbidden', data: { code: 'forbidden' } })
  }

  // Gehört die Community überhaupt zu dem Projekt, gegen das wir das JWT
  // geprüft haben? Ohne diese Zeile könnte eine Mitgliedschafts-Row mit dem
  // richtigen Projekt, aber einer communityId aus einer ANDEREN Runtime auf
  // eine fremde Community zeigen. 404 statt 403 — eine fremde Id soll sich
  // nicht bestätigen.
  const row = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: body.communityId,
  }).catch(() => null)
  if (!row || row.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Community not found' })
  }

  /**
   * DIE PLAN-GRENZE. `requirePlan: false` gibt es genau für zwei Fälle, und
   * beide sind Absicht:
   *  - LESEN (`state`): ein Basic-Owner soll erfahren DÜRFEN, dass es das
   *    Merkmal gibt und was es kostet — die Seite zeigt sonst einen leeren
   *    Kasten ohne Erklärung.
   *  - ENTFERNEN (`remove`): wer von Pro herunterstuft, muss seine Domain
   *    noch loswerden können. Eine Sperre, die den Rückweg mit versperrt,
   *    macht aus einer Herabstufung eine Falle.
   */
  if (options.requirePlan !== false && !customDomainAllowedForPlan(row.plan)) {
    logEvent('warn', 'community.custom_domain_plan_denied', {
      communityId: row.$id,
      runtimeUserId: identity.userId,
      plan: row.plan,
    })
    throw createError({ status: 403, statusText: 'Forbidden', data: { code: 'plan_required' } })
  }

  return { identity, row, databaseId }
}

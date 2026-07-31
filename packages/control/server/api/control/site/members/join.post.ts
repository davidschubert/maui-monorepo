import { ID, Query } from 'node-appwrite'
import { z } from 'zod'
import { SITE_JOIN_ROLE, type SiteJoinOutcome } from '../../../../../../core/shared/siteJoin'
import { decideJoin } from '../../../../../shared/siteTeam'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, resolveTenantOpenRegistration, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { verifyRuntimeIdentity } from '../../../../utils/onboardingService'

/**
 * BEITRETEN — die Stelle, an der Mitgliedschaft entsteht, wenn niemand einlädt
 * (A5, Davids Entscheidung 1 vom 2026-07-29).
 *
 * Warum sie hierher gehört und nicht in die Runtime: `community_members` ist eine
 * Tabelle des CONTROL PLANE, und die Platform-App hat dorthin nur einen
 * READ-ONLY-Key. Der Schreibkanal steht seit C16 (Service-Secret + Appwrite-JWT,
 * utils/onboardingService.ts) — es gibt genau einen, und dieser Endpunkt benutzt
 * ihn.
 *
 * BEWUSST OHNE Site-Rollen-Gate (wie accept.post.ts): hier ENTSTEHT die
 * Mitgliedschaft, ein `requireSiteTeamContext` würde sich selbst den Weg
 * versperren. Was trotzdem gilt:
 *  - Service-Secret: der Aufrufer ist unser Deployment.
 *  - JWT: WER beitritt — vom Control Plane selbst gegen das Pool-Projekt
 *    geprüft, nie eine Behauptung der Runtime.
 *  - Tenant ⇄ Projekt: die Site muss zu dem Projekt gehören, gegen das das JWT
 *    geprüft wurde (404, damit sich eine fremde Id nicht bestätigt).
 *  - Die REGEL selbst (decideJoin, pur + unit-getestet): entzogener Zugang
 *    schlägt jeden Auslöser, geschlossene Community lässt niemanden herein.
 *
 * ANTWORT IST EIN ERGEBNIS, KEIN FEHLER: 200 mit `outcome`. Ein 403 wäre hier
 * falsch — nicht die Berechtigung fehlt (das JWT ist gültig), sondern die
 * Community sagt „nein" bzw. „schon dabei". Und der Aufrufer ist eine
 * Middleware bzw. die Datentür: sie muss aus der Antwort HANDELN (Label
 * vergeben, Label einziehen), nicht einen Ausnahmezweig entwirren.
 *
 * `legacy` ist die einzige Zutat, die dieser Endpunkt der Runtime GLAUBT: dass
 * der Nutzer das Site-Label trägt, kann das Control Plane nicht prüfen — Labels
 * gehören dem Runtime-Projekt. Das ist dieselbe Vertrauensgrenze wie überall in
 * dieser Naht (das Secret beweist, WELCHES Deployment fragt) und kein neues
 * Recht: das Label vergibt die Runtime ohnehin selbst. Protokolliert wird es
 * trotzdem eigens, damit sichtbar bleibt, wie lange es Bestand gibt.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  /** = tenants.$id. Wird gegen das JWT-Projekt geprüft, nicht geglaubt. */
  communityId: z.string().min(1).max(36),
  trigger: z.enum(['registration', 'contribution', 'legacy']),
}).strict()

interface JoinResponse {
  outcome: SiteJoinOutcome
  role: string | null
}

export default defineEventHandler(async (event): Promise<JoinResponse> => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: body.communityId,
  }).catch(() => null)
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  // JEDEN Status lesen, nicht nur 'active': eine entzogene Zeile ist die
  // wichtigste Antwort dieses Endpunkts.
  const { rows: existing } = await admin.tablesDB.listRows<CommunityMemberRow>({
    databaseId,
    tableId: COMMUNITY_MEMBERS_TABLE,
    queries: [
      Query.equal('communityId', body.communityId),
      Query.equal('runtimeProjectId', identity.projectId),
      Query.equal('runtimeUserId', identity.userId),
      Query.limit(1),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not read site membership') })

  const current = existing[0]
  const decision = decideJoin({
    trigger: body.trigger,
    openRegistration: resolveTenantOpenRegistration(tenant.openRegistration),
    existing: current
      ? { id: current.$id, runtimeUserId: current.runtimeUserId, role: current.role, status: current.status }
      : null,
  })

  if (decision.outcome !== 'joined') {
    // Nur die Ablehnungen protokollieren — „schon dabei" ist der Normalfall und
    // würde das Log mit jedem Kommentar zumüllen.
    if (decision.outcome !== 'member') {
      logEvent('info', 'site.join_denied', {
        communityId: body.communityId,
        runtimeUserId: identity.userId,
        trigger: body.trigger,
        outcome: decision.outcome,
      })
    }
    return { outcome: decision.outcome, role: decision.role }
  }

  const role = decision.role ?? SITE_JOIN_ROLE
  try {
    await admin.tablesDB.createRow<CommunityMemberRow>({
      databaseId,
      tableId: COMMUNITY_MEMBERS_TABLE,
      rowId: ID.unique(),
      data: {
        communityId: body.communityId,
        runtimeProjectId: identity.projectId,
        runtimeUserId: identity.userId,
        role,
        status: 'active',
        email: identity.email ?? '',
        removedAt: null,
      },
    })
  }
  catch (error) {
    // Der Unique-Index über das Tripel (uq_member, control-015) ist das
    // Rennen-Netz: zwei Auslöser im selben Moment (Kommentar UND Stimme) würden
    // sonst zwei Mitgliedschaften anlegen. Der Verlierer fragt den Bestand
    // erneut, statt zu raten — sonst meldete er „beigetreten", während in
    // derselben Sekunde jemand den Zugang entzogen hat.
    if ((error as { code?: number })?.code !== 409) {
      throw toH3Error(error, 'Could not create membership')
    }
    const raced = await admin.tablesDB.listRows<CommunityMemberRow>({
      databaseId,
      tableId: COMMUNITY_MEMBERS_TABLE,
      queries: [
        Query.equal('communityId', body.communityId),
        Query.equal('runtimeProjectId', identity.projectId),
        Query.equal('runtimeUserId', identity.userId),
        Query.limit(1),
      ],
    }).then(res => res.rows[0] ?? null).catch(() => null)
    return raced && raced.status === 'active'
      ? { outcome: 'member', role: raced.role }
      : { outcome: 'removed', role: null }
  }

  logEvent('info', 'site.joined', {
    communityId: body.communityId,
    runtimeUserId: identity.userId,
    trigger: body.trigger,
    role,
  })

  return { outcome: 'joined', role }
})

import { Query } from 'node-appwrite'
import { z } from 'zod'
import { communityRoleHasCapability, isCommunityRole } from '../../../../../core/shared/communityAuthz'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, TENANT_AUDIENCES, resolveTenantAudience, type TenantRow } from '../../../../shared/types/tenantRecord'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'

/**
 * Self-Service: das LESE-PUBLIKUM einer Community setzen (C18, Davids
 * Entscheidung vom 2026-07-30 — die Sichtbarkeit ist wählbar, neue Communities
 * entstehen öffentlich).
 *
 * Derselbe Schreibweg wie beim Registrierungs-Schalter (S1) und beim
 * Erscheinungsbild (Entscheidung 12), aus demselben Grund: `communities` gehört
 * dem CONTROL PLANE, der Schalter steht aber im Dashboard der Kundin, das in
 * der PLATFORM-App läuft — und die hat hierher nur einen READ-ONLY-Key. Es gibt
 * genau EINEN vorgesehenen Kanal (onboardingService.ts): Service-Secret im
 * Header + Appwrite-JWT des Nutzers im Body.
 *
 * DREI unabhängige Prüfungen, alle drei müssen halten (Secret · JWT ·
 * Site-Rolle) — die ausführliche Begründung steht in registration.post.ts und
 * wird hier bewusst nicht kopiert.
 *
 * CAPABILITY `team.manage`, NICHT `branding.manage`: das hier ist keine Optik,
 * sondern eine ZUGANGSREGEL — dieselbe Sorte Entscheidung wie „offene
 * Registrierung". Beide Rollen (owner + admin) tragen heute beides; geprüft
 * wird trotzdem die richtige, damit eine spätere Rolle „nur Gestaltung" hier
 * nicht versehentlich die Türen aufmacht.
 *
 * WAS DIESE ROUTE NICHT TUT: den BESTAND umziehen. Die schon geschriebenen
 * Zeilen liegen im RUNTIME-Projekt, und dorthin hat das Control Plane keinen
 * Schlüssel — genau wie bei den Site-Labels (A5). Den zweiten Schritt macht der
 * Aufrufer: packages/onboarding/server/api/community/audience.patch.ts.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  /** = communities.$id. Wird NICHT geglaubt, sondern gegen die Mitgliedschaft geprüft. */
  communityId: z.string().min(1).max(36),
  audience: z.enum(TENANT_AUDIENCES),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
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
  }).catch((error) => { throw toH3Error(error, 'Could not read site membership') })

  const role = memberships[0]?.role
  if (!role || !isCommunityRole(role) || !communityRoleHasCapability(role, 'team.manage')) {
    logEvent('warn', 'community.audience_denied', {
      communityId: body.communityId,
      runtimeUserId: identity.userId,
      role: role ?? '',
    })
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  // Gehört die Site zu dem Projekt, gegen das wir das JWT geprüft haben?
  // 404 statt 403 — eine fremde Id soll sich nicht bestätigen.
  const community = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: body.communityId,
  }).catch(() => null)
  if (!community || community.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  const row = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: body.communityId,
    data: { audience: body.audience },
  }).catch((error) => { throw toH3Error(error, 'Could not update site') })

  logEvent('info', 'community.audience_changed', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    from: resolveTenantAudience(community.audience),
    to: body.audience,
  })

  // Immer über den fail-closed Leser antworten, nie über die rohe Spalte.
  return { communityId: row.$id, audience: resolveTenantAudience(row.audience) }
})

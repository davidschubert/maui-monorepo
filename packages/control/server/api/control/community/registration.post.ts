import { Query } from 'node-appwrite'
import { z } from 'zod'
import { communityRoleHasCapability, isCommunityRole } from '../../../../../core/shared/communityAuthz'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, resolveTenantOpenRegistration, type TenantRow } from '../../../../shared/types/tenantRecord'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'

/**
 * Self-Service: „Offene Registrierung" EINER Community umschalten
 * (Audit-Befund S1, Davids Entscheidung 4 vom 2026-07-27).
 *
 * Warum diese Route überhaupt existiert — der Schreibweg im Detail:
 * `tenants` gehört dem CONTROL PLANE, der Schalter steht aber im Dashboard der
 * Kundin, das in der PLATFORM-App läuft. Die Platform-App hat aufs Control
 * Plane nur einen READ-ONLY-Key (Scope rows.read) und kann deshalb per Design
 * nicht schreiben. Es gibt genau EINEN vorgesehenen Kanal, und der ist der vom
 * Onboarding bereits etablierte (onboardingService.ts): Service-Secret im
 * Header + Appwrite-JWT des Nutzers im Body. Diese Route benutzt ihn, statt
 * einen zweiten zu erfinden.
 *
 * DREI unabhängige Prüfungen, und alle drei müssen halten:
 *  1. Service-Secret — der Aufrufer ist unser eigenes Deployment (404 ohne
 *     konfiguriertes Secret, 401 bei falschem).
 *  2. JWT — WER schaltet. Vom Control Plane SELBST gegen das Pool-Projekt
 *     geprüft; eine Identitätsbehauptung des Aufrufers gilt nicht.
 *  3. Site-Rolle — der JWT-Inhaber ist owner/admin GENAU DIESER Site
 *     (community_members, `team.manage`). Deshalb ist eine mitgeschickte fremde
 *     `communityId` harmlos: ohne Mitgliedschaft endet sie in 403. Die Platform-App
 *     prüft dieselbe Rolle schon (requireCommunityPermission) — dass es hier NOCH
 *     einmal passiert, ist der Punkt: das Control Plane glaubt dem Aufrufer
 *     nichts.
 *
 * Geschrieben wird AUSSCHLIESSLICH `openRegistration` — kein durchgereichtes
 * Body-Objekt, keine weiteren Felder. Wirksam wird die Änderung, sobald der
 * Resolver-Cache der Platform-App abgelaufen ist (≤30 s).
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  /** = tenants.$id. Wird NICHT geglaubt, sondern gegen die Mitgliedschaft geprüft. */
  communityId: z.string().min(1).max(36),
  openRegistration: z.boolean(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  // Rolle DIESES Runtime-Users auf DIESER Site. Fail-closed: keine aktive
  // Mitgliedschaft, unbekannte Rolle oder zu schwache Rolle → 403.
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
    logEvent('warn', 'site.registration_toggle_denied', {
      communityId: body.communityId,
      runtimeUserId: identity.userId,
      role: role ?? '',
    })
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  // Gehört die Site überhaupt zu dem Projekt, gegen das wir das JWT geprüft
  // haben? Ohne diese Zeile könnte eine Mitgliedschafts-Row mit dem richtigen
  // Projekt, aber einer communityId aus einer ANDEREN Runtime auf einen fremden
  // Tenant zeigen. 404 statt 403 — eine fremde Id soll sich nicht bestätigen.
  const tenant = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: body.communityId,
  }).catch(() => null)
  if (!tenant || tenant.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  const row = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: body.communityId,
    data: { openRegistration: body.openRegistration },
  }).catch((error) => { throw toH3Error(error, 'Could not update site') })

  logEvent('info', 'site.registration_toggled', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    openRegistration: body.openRegistration,
  })

  return { communityId: row.$id, openRegistration: resolveTenantOpenRegistration(row.openRegistration) }
})

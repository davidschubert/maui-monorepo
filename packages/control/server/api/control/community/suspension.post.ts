import { Query } from 'node-appwrite'
import { z } from 'zod'
import { communityRoleHasCapability, isCommunityRole } from '../../../../../core/shared/communityAuthz'
import { resolveCommunitySuspension } from '../../../../../core/shared/communitySuspension'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'

/**
 * Warum ist meine Community gesperrt? (M13) — der GRUND, für den Owner.
 *
 * POST für eine Lesefrage, weil das JWT im Body reist und nie in einer URL
 * stehen darf (gleiches Muster wie `community/mine.post.ts`).
 *
 * Dieselben drei unabhängigen Prüfungen wie bei `branding.post.ts`:
 * Service-Secret (welches Deployment fragt) · JWT (wer fragt, vom Control Plane
 * SELBST geprüft) · Site-Rolle (`community.billing` — heute nur der Owner). Der
 * Grund ist der einzige Teil der Sperre, der nicht im Mandanten-Kontext mitreist,
 * und genau deshalb: er stünde sonst auf jeder öffentlichen Seite im
 * SSR-Payload und erzählte jedem Gast vom Zahlungsverzug dieser Community.
 *
 * Der Operator-Break-Glass reicht auch hier NICHT durch — das Control Plane
 * verlangt eine echte `community_members`-Row.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
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
  if (!role || !isCommunityRole(role) || !communityRoleHasCapability(role, 'community.billing')) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  const community = await admin.tablesDB.getRow<TenantRow>({
    databaseId, tableId: COMMUNITIES_TABLE, rowId: body.communityId,
  }).catch(() => null)
  if (!community || community.projectId !== identity.projectId) {
    throw createError({ status: 404, statusText: 'Site not found' })
  }

  return {
    suspension: resolveCommunitySuspension(community.suspension),
    reason: community.suspensionReason ?? '',
    suspendedAt: community.suspendedAt ?? null,
  }
})

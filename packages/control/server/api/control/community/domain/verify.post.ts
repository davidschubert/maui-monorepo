import { z } from 'zod'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { advanceCustomDomain, customDomainStateFor } from '../../../../utils/customDomainService'
import { requireCommunityDomainOwner } from '../../../../utils/communityDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * PRÜFEN — der eine Knopf, der den ganzen Ablauf trägt (control-035).
 *
 * Er ist RE-ENTRANT: beliebig oft drückbar, kommt jedes Mal so weit wie
 * möglich und schreibt ehrlich hin, wo es hängt. Der Ablauf selbst steht in
 * `advanceCustomDomain()`; hier steht nur, was davon in die Zeile kommt.
 *
 * ZURÜCKGEGEBEN WIRD DER GESCHRIEBENE ZUSTAND, nicht der erhoffte: das
 * Dashboard übernimmt ihn aus der ANTWORT (Muster registration.patch.ts) —
 * sonst behauptete es bis zu 30 s lang das Alte, weil der Tenant-Resolver der
 * Platform-App die Host-Auflösung so lange cacht.
 *
 * `needsPlatformRegistration` ist die AUFFORDERUNG an die Runtime: der letzte
 * Schritt (Appwrite-Web-Platform, F45) gehört ihr, weil das Control Plane für
 * das Pool-Projekt keinen Schlüssel hat — dieselbe Grenze wie bei
 * `revokeCommunityLabel` (A5). Sie meldet sich danach mit
 * `domain/activate` zurück.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireCommunityDomainOwner(event, body)

  if (!row.customDomain) {
    throw createError({ status: 400, statusText: 'No domain', data: { code: 'domain_missing' } })
  }

  const advance = await advanceCustomDomain(event, row)
  const admin = createAdminClient(event)
  const saved = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: row.$id,
    data: advance.patch,
  }).catch((error) => { throw toH3Error(error, 'Could not update domain state') })

  logEvent('info', 'community.custom_domain_checked', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    domain: row.customDomain,
    status: advance.status,
    detail: advance.error.slice(0, 200),
  })

  return {
    ...customDomainStateFor(event, saved),
    needsPlatformRegistration: advance.needsPlatformRegistration,
  }
})

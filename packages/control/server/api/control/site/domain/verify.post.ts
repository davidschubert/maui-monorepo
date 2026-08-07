import { z } from 'zod'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../../../shared/types/website'
import { advanceSiteDomain, siteDomainStateFor } from '../../../../utils/siteDomainService'
import { requireSiteDomainCaller } from '../../../../utils/siteDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * PRÜFEN — der eine Knopf, der den ganzen Ablauf trägt (control-036).
 *
 * Re-entrant: beliebig oft drückbar, kommt jedes Mal so weit wie möglich,
 * schreibt ehrlich hin, wo es hängt. Der Ablauf steht in `advanceSiteDomain()`.
 *
 * ZURÜCKGEGEBEN WIRD DER GESCHRIEBENE ZUSTAND, nicht der erhoffte — sonst
 * behauptete die Oberfläche bis zu 30 s lang das Alte, weil die Silo-App ihre
 * Adress-Auskunft so lange zwischenspeichert.
 *
 * `needsPlatformRegistration` ist die Aufforderung an die SILO-APP: der letzte
 * Schritt (Appwrite-Web-Platform, F45) gehört ihr, weil das Control Plane für
 * fremde Projekte keinen Schlüssel hat. Sie meldet sich mit `activate` zurück.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  projectId: z.string().min(1).max(64),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireSiteDomainCaller(event, body)

  if (!row.customDomain) {
    throw createError({ status: 400, statusText: 'No domain', data: { code: 'domain_missing' } })
  }

  const advance = await advanceSiteDomain(event, row)
  const admin = createAdminClient(event)
  const saved = await admin.tablesDB.updateRow<WebsiteRow>({
    databaseId, tableId: WEBSITES_TABLE, rowId: row.$id, data: advance.patch,
  }).catch((error) => { throw toH3Error(error, 'Could not update domain state') })

  logEvent('info', 'website.custom_domain_checked', {
    website: row.slug,
    runtimeUserId: identity.userId,
    domain: row.customDomain,
    status: advance.status,
    detail: advance.error.slice(0, 200),
  })

  return {
    ...siteDomainStateFor(event, saved),
    needsPlatformRegistration: advance.needsPlatformRegistration,
  }
})

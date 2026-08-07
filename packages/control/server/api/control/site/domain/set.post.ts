import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../../../shared/types/website'
import { validateCustomDomain } from '../../../../../shared/customDomain'
import { siteDomainStateFor } from '../../../../utils/siteDomainService'
import { customDomainTakenByOther } from '../../../../utils/customDomainOwnership'
import { requireSiteDomainCaller } from '../../../../utils/siteDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * Eine eigene Domain für ein SILO eintragen (control-036).
 *
 * Wortgleich zur Community-Fassung, wo es wortgleich sein MUSS, und das ist
 * Absicht: geprüft wird mit derselben Funktion (`validateCustomDomain` aus
 * control-035, inklusive der Sperre gegen `*.pukalani.app` — ohne die könnte
 * ein Silo `login.pukalani.app` als „eigene Domain" beanspruchen und damit
 * RESERVED_SUBDOMAINS umgehen), geschrieben werden dieselben vier Dinge, und
 * das Token wird bei JEDER Eintragung neu gewürfelt.
 *
 * Der eine Unterschied: die Eindeutigkeit wird über BEIDE Tabellen geprüft
 * (`customDomainTakenByOther`) — eine Domain, die schon eine Community
 * bedient, darf kein Silo bekommen und umgekehrt.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  projectId: z.string().min(1).max(64),
  domain: z.string().min(1).max(300),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireSiteDomainCaller(event, body)

  const check = validateCustomDomain(body.domain)
  if (!check.ok) {
    throw createError({ status: 400, statusText: 'Invalid domain', data: { code: `domain_${check.reason}` } })
  }

  if (await customDomainTakenByOther(event, { domain: check.domain, allowWebsiteId: row.$id })) {
    throw createError({ status: 409, statusText: 'Domain already taken', data: { code: 'domain_taken' } })
  }

  const admin = createAdminClient(event)
  const saved = await admin.tablesDB.updateRow<WebsiteRow>({
    databaseId,
    tableId: WEBSITES_TABLE,
    rowId: row.$id,
    data: {
      customDomain: check.domain,
      customDomainStatus: 'pending_dns',
      customDomainToken: randomBytes(16).toString('hex'),
      customDomainError: '',
      customDomainVerifiedAt: null,
      customDomainActivatedAt: null,
    },
  }).catch((error) => { throw toH3Error(error, 'Could not save domain') })

  logEvent('info', 'website.custom_domain_set', {
    website: row.slug,
    projectId: row.projectId,
    runtimeUserId: identity.userId,
    domain: check.domain,
  })

  return siteDomainStateFor(event, saved)
})

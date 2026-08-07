import { z } from 'zod'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { customDomainForms } from '../../../../../shared/customDomain'
import { customDomainStateFor } from '../../../../utils/customDomainService'
import { requireCommunityDomainOwner } from '../../../../utils/communityDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'
import { ploiConfig, removePloiTenant } from '../../../../utils/ploi'

/**
 * Die eigene Domain WIEDER ABGEBEN (control-035).
 *
 * REIHENFOLGE IST DIE GANZE ENTSCHEIDUNG: erst die ZEILE leeren, dann bei ploi
 * aufräumen. Die Zeile ist die Wahrheit — sobald dort nichts mehr steht, löst
 * der Host bei uns nicht mehr auf (404), und die Subdomain hört auf, mit 301
 * dorthin zu zeigen. Umgekehrt (erst ploi, dann die Zeile) gäbe es ein
 * Fenster, in dem die Community auf eine Adresse umleitet, die nginx schon
 * nicht mehr kennt.
 *
 * DAS AUFRÄUMEN IST FAIL-SOFT und darf die Abgabe nie in einen Fehler
 * verwandeln. Ein zurückgelassener nginx-vHost ist Hausarbeit, kein
 * Sicherheitsproblem: er zeigt auf eine App, die den Host nicht kennt, und die
 * antwortet 404. (Die Appwrite-Web-Platform räumt die RUNTIME ab — dieselbe
 * Schlüsselgrenze wie beim Anlegen.)
 *
 * OHNE PLAN-PRÜFUNG (`requirePlan: false`): wer von Pro herunterstuft, muss
 * seine Domain noch loswerden können. Eine Sperre, die den Rückweg
 * mitversperrt, macht aus einer Herabstufung eine Falle.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireCommunityDomainOwner(event, body, { requirePlan: false })

  const previous = row.customDomain || ''
  const admin = createAdminClient(event)
  const saved = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: row.$id,
    data: {
      customDomain: '',
      customDomainStatus: 'none',
      customDomainToken: '',
      customDomainError: '',
      customDomainVerifiedAt: null,
      customDomainActivatedAt: null,
    },
  }).catch((error) => { throw toH3Error(error, 'Could not remove domain') })

  if (previous) {
    for (const form of customDomainForms(previous)) {
      const result = await removePloiTenant(ploiConfig(event), form)
      if (!result.ok && !result.skipped) {
        logEvent('warn', 'community.custom_domain_cleanup_failed', {
          communityId: row.$id, domain: form, detail: result.message.slice(0, 200),
        })
      }
    }
  }

  logEvent('info', 'community.custom_domain_removed', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    domain: previous,
  })

  return customDomainStateFor(event, saved)
})

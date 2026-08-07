import { z } from 'zod'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../../../shared/types/website'
import { customDomainForms } from '../../../../../shared/customDomain'
import { siteDomainStateFor, siteploi } from '../../../../utils/siteDomainService'
import { requireSiteDomainCaller } from '../../../../utils/siteDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'
import { removePloiAliases } from '../../../../utils/ploi'

/**
 * Die eigene Domain WIEDER ABGEBEN (control-036).
 *
 * REIHENFOLGE WIE IM POOL: erst die ZEILE leeren, dann bei ploi aufräumen. Die
 * Zeile ist die Wahrheit — sobald dort nichts mehr steht, hört der alte Host
 * auf umzuleiten (≤30 s Cache der Silo-App). Umgekehrt gäbe es ein Fenster, in
 * dem die Site auf eine Adresse zeigt, die nginx schon nicht mehr kennt.
 *
 * ── EIN UNTERSCHIED, DER GEMELDET WERDEN MUSS ─────────────────────────────
 * Im Pool ist ein zurückgelassener vHost harmlos: der Tenant-Resolver findet
 * die Community nicht mehr, die Adresse antwortet 404. Eine SILO-App hat diese
 * Tür nicht — sie beantwortet jeden Host, unter dem nginx sie erreichbar
 * macht. Bleibt der Alias stehen, liefert die Site also weiter Inhalte unter
 * einer Adresse, die dem Kunden nicht mehr gehört.
 *
 * Deshalb wird ein Fehlschlag beim Abräumen hier NICHT still verschluckt: er
 * steht im Log UND als `cleanupError` in der Antwort. Die Abgabe selbst hält
 * er trotzdem nicht auf — sie ist bereits geschehen.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  projectId: z.string().min(1).max(64),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireSiteDomainCaller(event, body)

  const previous = row.customDomain || ''
  const admin = createAdminClient(event)
  const saved = await admin.tablesDB.updateRow<WebsiteRow>({
    databaseId,
    tableId: WEBSITES_TABLE,
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

  let cleanupError = ''
  if (previous) {
    const result = await removePloiAliases(siteploi(event, row), customDomainForms(previous))
    if (!result.ok && !result.skipped) {
      cleanupError = result.message
      logEvent('warn', 'website.custom_domain_cleanup_failed', {
        website: row.slug, domain: previous, detail: result.message.slice(0, 200),
      })
    }
  }

  logEvent('info', 'website.custom_domain_removed', {
    website: row.slug,
    runtimeUserId: identity.userId,
    domain: previous,
  })

  return { ...siteDomainStateFor(event, saved), cleanupError }
})

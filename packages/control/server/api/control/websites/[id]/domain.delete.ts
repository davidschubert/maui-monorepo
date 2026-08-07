import { WEBSITES_TABLE, type WebsiteRow } from '../../../../../shared/types/website'
import { customDomainForms } from '../../../../../shared/customDomain'
import { siteDomainStateFor, siteploi } from '../../../../utils/siteDomainService'
import { removePloiAliases } from '../../../../utils/ploi'

/**
 * BETREIBER-SEITE: die eigene Domain einer Website wieder abgeben
 * (control-036).
 *
 * Reihenfolge wie überall in diesem Ablauf: erst die ZEILE leeren, dann bei
 * ploi aufräumen. Sobald die Zeile leer ist, hört die Silo-App auf umzuleiten
 * (≤30 s Cache); umgekehrt gäbe es ein Fenster, in dem sie auf eine Adresse
 * zeigt, die nginx nicht mehr kennt.
 *
 * ── DIE APPWRITE-EINTRÄGE BLEIBEN HIER LIEGEN, UND DAS STEHT IM ERGEBNIS ──
 * Die Web-Platforms im Projekt der Site kann nur die Site selbst abräumen —
 * das Control Plane hat dort keinen Schlüssel. Über den Betreiber-Weg
 * geschieht das also NICHT. Folge: die abgegebene Domain darf weiterhin als
 * Origin mit dem Appwrite-Projekt der Site sprechen, bis sie jemand entfernt.
 * Das ist unerwünscht, aber kein Zugang zu Daten (Origin ≠ Session), und es
 * wird gemeldet statt verschwiegen — im Runbook steht der Handgriff.
 *
 * Wer den Weg über das Silo-Dashboard nimmt, hat das Problem nicht: dort
 * räumt die App ihre Einträge selbst ab.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing site id' })

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<WebsiteRow>({ databaseId, tableId: WEBSITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Website not found') })

  const previous = row.customDomain || ''
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
    website: row.slug, via: 'operator', domain: previous,
  })

  return { ...siteDomainStateFor(event, saved), cleanupError }
})

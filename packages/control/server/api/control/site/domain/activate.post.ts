import { z } from 'zod'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../../../shared/types/website'
import { siteDomainStatusOf } from '../../../../../shared/siteDomain'
import { siteDomainStateFor } from '../../../../utils/siteDomainService'
import { requireSiteDomainCaller } from '../../../../utils/siteDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * FREISCHALTEN — der Schlussstein, den die SILO-APP meldet statt ihn zu
 * erleben (control-036).
 *
 * Warum die App: der letzte Schritt vor dem Aktivwerden ist die
 * Appwrite-Web-Platform (F45) — ohne sie ist auf der Kundendomain jede
 * Realtime tot, und der Handschlag verrät es nicht einmal (er antwortet 101
 * auch für einen abgewiesenen Origin). Registrieren kann sie nur, wer den
 * Schlüssel DES PROJEKTS hat, und das ist die Silo-App selbst.
 *
 * ── WARUM DAS KEIN LOCH IST ───────────────────────────────────────────────
 * Diese Route setzt `active` auf die Behauptung des Aufrufers hin. Der
 * Zustand DAVOR muss aber `pending_platform` sein, und dorthin kommt eine
 * Domain nur durch `verify` — also nur, nachdem das Control Plane SELBST den
 * TXT-Nachweis, die Zeige-Prüfung und (außerhalb des Trockenlaufs) die
 * HTTPS-Antwort gemessen hat. Die App kann eine Domain damit nicht
 * freischalten, sie kann nur den letzten Schritt quittieren. Jeder andere
 * Ausgangszustand ist ein 409.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  projectId: z.string().min(1).max(64),
  /** Was die App nicht geschafft hat ('' = alles gut). Hält die Freischaltung
   *  auf und landet als Fehlertext beim Betreiber. */
  error: z.string().max(400).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireSiteDomainCaller(event, body)

  if (!row.customDomain || siteDomainStatusOf(row) !== 'pending_platform') {
    throw createError({ status: 409, statusText: 'Domain is not ready', data: { code: 'domain_not_ready' } })
  }

  const failure = (body.error || '').trim()
  const admin = createAdminClient(event)
  const saved = await admin.tablesDB.updateRow<WebsiteRow>({
    databaseId,
    tableId: WEBSITES_TABLE,
    rowId: row.$id,
    data: failure
      // Bleibt stehen, wo es steht — mit dem Grund. NIE „aktiv" auf einen
      // Fehlschlag hin: aktiv zieht die Umleitung des alten Hosts nach sich,
      // und dann sitzt der Kunde auf einer Adresse ohne Live-Aktualisierung.
      ? { customDomainStatus: 'pending_platform', customDomainError: failure.slice(0, 500) }
      : { customDomainStatus: 'active', customDomainError: '', customDomainActivatedAt: new Date().toISOString() },
  }).catch((error) => { throw toH3Error(error, 'Could not activate domain') })

  logEvent(failure ? 'warn' : 'info', 'website.custom_domain_activated', {
    website: row.slug,
    runtimeUserId: identity.userId,
    domain: row.customDomain,
    detail: failure.slice(0, 200),
  })

  return siteDomainStateFor(event, saved)
})

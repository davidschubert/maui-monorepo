import { z } from 'zod'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { resolveCustomDomainStatus } from '../../../../../shared/customDomain'
import { customDomainStateFor } from '../../../../utils/customDomainService'
import { requireCommunityDomainOwner } from '../../../../utils/communityDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * FREISCHALTEN — der Schlussstein, und der einzige Schritt, den die RUNTIME
 * meldet statt ihn zu erleben (control-035).
 *
 * Warum die Runtime: der letzte Schritt vor dem Aktivwerden ist die
 * Appwrite-Web-Platform (F45) — ohne sie ist auf der Kundendomain jede
 * Realtime tot, und der Handschlag verrät es nicht einmal. Registriert werden
 * kann sie nur IM POOL-PROJEKT, und dafür hat das Control Plane keinen
 * Schlüssel (dieselbe Grenze wie bei `revokeCommunityLabel`, A5). Die
 * Platform-App macht es also selbst und sagt hier Bescheid.
 *
 * ── WARUM DAS KEIN LOCH IST ───────────────────────────────────────────────
 * Diese Route setzt `active` allein auf die BEHAUPTUNG des Aufrufers hin. Das
 * ist vertretbar, weil sie NICHT von irgendwem erreichbar ist: es gilt
 * dieselbe Vierfach-Prüfung wie überall an dieser Naht (Service-Secret + JWT +
 * Owner-Rolle + Plan), und der Aufrufer ist unser eigenes Deployment.
 *
 * Vor allem aber: der Zustand DAVOR muss `pending_platform` sein. Dorthin
 * kommt eine Domain nur durch `domain/verify` — also nur, nachdem das Control
 * Plane SELBST den TXT-Nachweis, die Zeige-Prüfung und (außerhalb des
 * Trockenlaufs) die HTTPS-Antwort gemessen hat. Die Runtime kann eine Domain
 * damit nicht freischalten, sie kann nur den letzten Schritt quittieren.
 * Jeder andere Ausgangszustand ist ein 409.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  /** Was die Runtime nicht geschafft hat ('' = alles gut). Landet als
   *  Fehlertext beim Owner und hält die Freischaltung auf. */
  error: z.string().max(400).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireCommunityDomainOwner(event, body)

  const status = resolveCustomDomainStatus(row.customDomainStatus)
  if (!row.customDomain || status !== 'pending_platform') {
    throw createError({ status: 409, statusText: 'Domain is not ready', data: { code: 'domain_not_ready' } })
  }

  const failure = (body.error || '').trim()
  const admin = createAdminClient(event)
  const saved = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: row.$id,
    data: failure
      // Bleibt stehen, wo es steht — mit dem Grund. NIE „aktiv" auf einen
      // Fehlschlag hin: eine aktive Domain zieht den 301 der Subdomain nach
      // sich, und dann sitzt der Kunde auf einer Adresse ohne Realtime.
      ? { customDomainStatus: 'pending_platform', customDomainError: failure.slice(0, 500) }
      : { customDomainStatus: 'active', customDomainError: '', customDomainActivatedAt: new Date().toISOString() },
  }).catch((error) => { throw toH3Error(error, 'Could not activate domain') })

  logEvent(failure ? 'warn' : 'info', 'community.custom_domain_activated', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    domain: row.customDomain,
    detail: failure.slice(0, 200),
  })

  return customDomainStateFor(event, saved)
})

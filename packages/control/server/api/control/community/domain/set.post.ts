import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../../shared/types/tenantRecord'
import { validateCustomDomain } from '../../../../../shared/customDomain'
import { customDomainStateFor } from '../../../../utils/customDomainService'
import { customDomainTakenByOther } from '../../../../utils/customDomainOwnership'
import { requireCommunityDomainOwner } from '../../../../utils/communityDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * Eine eigene Domain EINTRAGEN (control-035, Davids Entscheidung 3:
 * Selbstbedienung — der Owner tippt, das System prüft).
 *
 * Geschrieben werden vier Dinge und nichts sonst: die geprüfte Domain, der
 * Status `pending_dns`, ein frisches Token und ein leerer Fehlertext. Der
 * Aufrufer bestimmt WEDER den Status NOCH das Token — sonst könnte ein
 * durchgereichter Rumpf eine Domain sofort auf „aktiv" setzen.
 *
 * ── DAS TOKEN IST DIE GRENZE ZWISCHEN ZWEI COMMUNITIES ────────────────────
 * Es wird bei JEDER Eintragung neu gewürfelt, auch wenn dieselbe Community
 * dieselbe Domain noch einmal einträgt. Ein wiederverwendetes Token wäre der
 * Fall, in dem jemand einen alten TXT-Record aus einer früheren Prüfung stehen
 * lässt und die Domain damit ohne neuen Nachweis zurückholt.
 *
 * ── EINDEUTIGKEIT ÜBER BEIDE FORMEN UND (seit control-036) BEIDE TABELLEN ──
 * Ein Unique-Index geht nicht (leere Strings kollidieren in MariaDB — s.
 * Migration control-035), also prüft der Code. Und er prüft das PAAR: trägt
 * Community A `www.kunde.de`, darf Community B auch `kunde.de` nicht
 * bekommen — beide Formen lösen auf dieselbe Zeile auf, und die zweite
 * Community bekäme sonst eine Adresse, die einer anderen gehört. Seit es
 * eigene Domains auch für SILOS gibt, zählt `websites` mit.
 *
 * DIE PRÜFUNG IST EIN RENNEN, und das ist bewusst so hingenommen: zwei
 * gleichzeitige Eintragungen derselben Domain durch zwei Communities könnten
 * theoretisch beide durchkommen. Die Freischaltung nicht — der TXT-Record
 * trägt genau EIN Token, also kommt höchstens eine der beiden je auf `active`,
 * und nur `active` wird vom Resolver bedient. Ein verteiltes Schloss für ein
 * Fenster von Millisekunden wäre teurer als die Tatsache, die es verhindert.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
  domain: z.string().min(1).max(300),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row, databaseId, identity } = await requireCommunityDomainOwner(event, body)

  const check = validateCustomDomain(body.domain)
  if (!check.ok) {
    throw createError({ status: 400, statusText: 'Invalid domain', data: { code: `domain_${check.reason}` } })
  }
  const domain = check.domain

  // SEIT control-036 ÜBER BEIDE TABELLEN. Vorher fragte diese Zeile nur
  // `communities` — seit es eigene Domains auch für Silos gibt (`websites`),
  // wäre dieselbe Domain gleichzeitig an eine Community und an ein Silo
  // vergebbar gewesen, und wer antwortet, entschiede die Reihenfolge der
  // nginx-vHosts. Begründung und Formen-Paar: `utils/customDomainOwnership.ts`.
  if (await customDomainTakenByOther(event, { domain, allowCommunityId: row.$id })) {
    throw createError({ status: 409, statusText: 'Domain already taken', data: { code: 'domain_taken' } })
  }

  const admin = createAdminClient(event)
  const token = randomBytes(16).toString('hex')
  const saved = await admin.tablesDB.updateRow<TenantRow>({
    databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: row.$id,
    data: {
      customDomain: domain,
      customDomainStatus: 'pending_dns',
      customDomainToken: token,
      customDomainError: '',
      customDomainVerifiedAt: null,
      customDomainActivatedAt: null,
    },
  }).catch((error) => { throw toH3Error(error, 'Could not save domain') })

  logEvent('info', 'community.custom_domain_set', {
    communityId: row.$id,
    runtimeUserId: identity.userId,
    domain,
  })

  return customDomainStateFor(event, saved)
})

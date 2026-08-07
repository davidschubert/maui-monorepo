import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { WEBSITES_TABLE, type WebsiteRow } from '../../../../../shared/types/website'
import { validateCustomDomain } from '../../../../../shared/customDomain'
import { siteDomainStateFor } from '../../../../utils/siteDomainService'
import { customDomainTakenByOther } from '../../../../utils/customDomainOwnership'

/**
 * BETREIBER-SEITE: eine eigene Domain an einer Website eintragen (control-036).
 *
 * ── ZWEI OBERFLÄCHEN, EIN ABLAUF ─────────────────────────────────────────
 * Davids Auftrag nennt beides: die Betreiber-Konsole
 * (`control.pukalani.app/dashboard/websites`) UND das Dashboard der Silo-App.
 * Dies ist die erste. Sie tut FACHLICH dasselbe wie
 * `/api/control/site/domain/set`, nur mit einer anderen Tür davor:
 *
 *   Silo-Weg:      Service-Secret + JWT eines Kontos DIESES Projekts.
 *   Betreiber-Weg: `sites.manage` — die Capability, die auch alles andere in
 *                  diesem Register öffnet (Registrieren, Produkte zuteilen,
 *                  Abmelden). Wer eine Website anlegen darf, darf ihre
 *                  Adresse bestimmen.
 *
 * Die REGELN sind identisch, weil es dieselben Funktionen sind
 * (`validateCustomDomain`, `customDomainTakenByOther`) — es gibt keine zweite
 * Vorstellung davon, was hier erlaubt ist.
 *
 * Und wie überall: der Aufrufer bestimmt WEDER Status NOCH Token. Ein
 * Betreiber kann eine Domain eintragen, nicht freischalten.
 */
const bodySchema = z.object({ domain: z.string().min(1).max(300) }).strict()

export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ status: 400, statusText: 'Missing site id' })

  const body = await readValidatedBody(event, bodySchema.parse)
  const check = validateCustomDomain(body.domain)
  if (!check.ok) {
    throw createError({ status: 400, statusText: 'Invalid domain', data: { code: `domain_${check.reason}` } })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.getRow<WebsiteRow>({ databaseId, tableId: WEBSITES_TABLE, rowId: id })
    .catch((error) => { throw toH3Error(error, 'Website not found') })

  if (await customDomainTakenByOther(event, { domain: check.domain, allowWebsiteId: row.$id })) {
    throw createError({ status: 409, statusText: 'Domain already taken', data: { code: 'domain_taken' } })
  }

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
    website: row.slug, via: 'operator', domain: check.domain,
  })

  return siteDomainStateFor(event, saved)
})

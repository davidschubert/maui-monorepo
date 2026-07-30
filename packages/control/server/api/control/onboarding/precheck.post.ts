import { Query } from 'node-appwrite'
import { z } from 'zod'
import { inviteCodeSchema } from '../../../../schemas/onboarding'
import { createSlugSchema, slugToHost } from '../../../../schemas/tenant'
import { TENANTS_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { checkInviteCode } from '../../../utils/inviteCodes'
import { requireOnboardingCaller } from '../../../utils/onboardingService'

/**
 * Vorprüfung für den Wizard — NICHT verbrauchend.
 *
 * Zwei Fragen in einer Route, weil sie im Wizard an zwei Stellen gebraucht
 * werden und beide dasselbe Recht verlangen (unser eigenes Deployment fragt):
 *  - `code`: gilt der Einladungs-Code? (Eintritt in den Wizard — niemand soll
 *    sieben Schritte füllen, um am Ende abgewiesen zu werden.)
 *  - `slug`: ist die Adresse noch frei? (Live-Rückmeldung im Namensschritt.)
 *
 * Antwortet bewusst NUR mit Booleans: der Ablehnungsgrund eines Codes bleibt
 * im Log (sonst wäre die Route ein Orakel zum Code-Raten). Kein JWT nötig —
 * hier entsteht nichts und es werden keine personenbezogenen Daten berührt.
 */
const bodySchema = z.object({
  code: inviteCodeSchema.optional(),
  slug: createSlugSchema().optional(),
  /** Adresse des eingeloggten Nutzers — nötig, seit Codes an eine Adresse
   *  gebunden sein können (control-017). Ohne sie gilt ein gebundener Code als
   *  ungültig, und der eingeladene Kunde käme nicht durch sein eigenes Tor. */
  email: z.string().trim().toLowerCase().email().max(254).optional(),
}).strict().refine(body => body.code !== undefined || body.slug !== undefined, 'empty precheck')

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const result: { codeValid?: boolean, slugAvailable?: boolean } = {}

  if (body.code !== undefined) {
    const invite = await checkInviteCode(event, body.code, Date.now(), body.email)
    if (!invite.valid) {
      logEvent('info', 'onboarding.precheck_invite_rejected', { reason: invite.reason })
    }
    result.codeValid = invite.valid
  }

  if (body.slug !== undefined) {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const { total } = await admin.tablesDB.listRows<TenantRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: TENANTS_TABLE,
      queries: [Query.equal('host', slugToHost(body.slug)), Query.limit(1)],
    })
    result.slugAvailable = total === 0
  }

  return result
})

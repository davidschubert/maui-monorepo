import { Query } from 'node-appwrite'
import { z } from 'zod'
import { inviteCodeSchema } from '../../../../schemas/onboarding'
import { createSlugSchema, slugToHost } from '../../../../schemas/tenant'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { checkInviteCode } from '../../../utils/inviteCodes'
import { requireOnboardingCaller } from '../../../utils/onboardingService'
import { isNameReservedInDb } from '../../../utils/reservedNames'

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
  /** Hat Appwrite diese Adresse bestätigt? Pflicht-Bedingung für gebundene
   *  Codes seit dem Audit 2026-08-02 — hier nur, damit der Wizard dieselbe
   *  Antwort gibt wie das Anlegen und niemand sieben Schritte füllt, um am Ende
   *  an der Bestätigung zu scheitern. Der VERBINDLICHE Ort der Prüfung ist
   *  site.post.ts (dort steht ein JWT dahinter, hier nur das Service-Secret). */
  emailVerified: z.boolean().optional(),
}).strict().refine(body => body.code !== undefined || body.slug !== undefined, 'empty precheck')

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const result: { codeValid?: boolean, slugAvailable?: boolean, codeReason?: 'email_unverified' } = {}

  if (body.code !== undefined) {
    const invite = await checkInviteCode(event, body.code, Date.now(), body.email, body.emailVerified)
    if (!invite.valid) {
      logEvent('info', 'onboarding.precheck_invite_rejected', { reason: invite.reason })
    }
    result.codeValid = invite.valid
    // Nur DIESER eine Grund verlässt die Route (s. site.post.ts): er ist erst
    // erreichbar, wenn die Adresse zum gebundenen Code passt — er verrät also
    // nichts, was der Fragende nicht schon wüsste, und ohne ihn stünde der
    // Eingeladene vor einem stummen „Code ungültig".
    if (invite.reason === 'unverified_email') result.codeReason = 'email_unverified'
  }

  if (body.slug !== undefined) {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    const { total } = await admin.tablesDB.listRows<TenantRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: COMMUNITIES_TABLE,
      queries: [Query.equal('host', slugToHost(body.slug)), Query.limit(1)],
    })
    // Dieselbe Antwort für „schon vergeben" und „gesperrt" (control-027) —
    // genau wie beim Anlegen: der Nutzer soll einen anderen Namen wählen. Ohne
    // diese Prüfung sähe das Formular „frei" und der letzte Wizard-Schritt
    // antwortete 409; die Enttäuschung gehört ins Namensfeld, nicht ans Ende.
    result.slugAvailable = total === 0 && !(await isNameReservedInDb(event, body.slug))
  }

  return result
})

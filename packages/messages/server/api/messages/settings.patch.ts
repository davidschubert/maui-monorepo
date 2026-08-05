import { createMessageSettingsSchema } from '../../../schemas/message'

/**
 * DER OWNER-SCHALTER — setzen (Konzept § 2.6, Davids Entscheidung 4).
 *
 * `messages.manage` hat AUSSCHLIESSLICH der Owner (communityAuthz.ts). Das ist
 * keine Verwaltung dessen, was es gibt, sondern die Entscheidung, ob es einen
 * unbeobachteten Kanal zwischen Mitgliedern überhaupt gibt.
 *
 * ── DIE M13-SPERRE GILT HIER NICHT, UND DAS IST ABSICHT ──────────────────
 * `actor: 'operator'` an der Datentür (siehe `saveMessagesEnabled`). Davids
 * Grenze lautet: zu ist jeder INHALT, offen bleiben Owner-Einstellungen und
 * Moderation. Eine wegen Zahlungsverzug stillgelegte Community soll ihren
 * privaten Kanal weiter ZUMACHEN können — die Sperre soll zum Zahlen bewegen,
 * nicht den Owner aus seinen eigenen Einstellungen aussperren.
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  await requireCommunityPermission(event, 'messages.manage')
  const body = await readValidatedBody(event, createMessageSettingsSchema().parse)

  return { enabled: await saveMessagesEnabled(event, body.enabled) }
})

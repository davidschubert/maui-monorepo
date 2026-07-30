import { ID, Query } from 'node-appwrite'
import { createAdminClient, createSessionClient } from '../../lib/appwrite'
import { recoverySchema } from '../../../schemas/auth'

/**
 * Email-OTP anfordern (passwortloser Login). Läuft als GUEST — Appwrite
 * legt unbekannte E-Mails dabei automatisch als User an (Auto-Signup).
 * Die Security-Phrase geht in Mail UND Response — die UI zeigt sie an,
 * damit User die echte Mail von Phishing unterscheiden können.
 */
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, recoverySchema.parse)

  // Auto-Signup würde die Registrierungssperre umgehen: ist die Registrierung
  // zu, dürfen sich nur BESTEHENDE User per Code einloggen — für unbekannte
  // E-Mails keine Neuanlage. „Zu" hat ZWEI Ebenen, und eine genügt: die
  // Instanz-Sperre (app_config/Wartungsmodus, EINE Row pro Projekt) und — seit
  // S1 — die Mandanten-Sperre (tenants.openRegistration, control-018), die im
  // Pool pro Community stehen kann, wo app_config es nicht kann.
  const appConfig = await getAppConfig(event)
  if (!appConfig.registrationEnabled || appConfig.maintenanceMode || !tenantRegistrationOpen(event)) {
    // Exakter Treffer mit explizitem Limit (search ohne Limit könnte den
    // exakten Match jenseits der 25er-Default-Seite verfehlen und einen legitimen
    // bestehenden User fälschlich aussperren). E-Mail ist im Schema bereits
    // normalisiert (lowercase), Appwrite speichert Account-Mails ebenfalls klein.
    const admin = createAdminClient(event)
    const found = await admin.users.list({ queries: [Query.equal('email', email), Query.limit(1)] })
    if (found.total === 0) {
      throw createError({ status: 403, statusText: 'Registration is currently disabled' })
    }
  }

  const { account } = createSessionClient(event)

  const token = await account.createEmailToken({
    userId: ID.unique(),
    email,
    phrase: true,
  }).catch((error) => { throw toH3Error(error, 'Could not send login code') })

  return { ok: true, userId: token.userId, phrase: token.phrase }
})

import { ID } from 'node-appwrite'
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

  // Auto-Signup würde die Registrierungssperre umgehen: Ist die Registrierung
  // zu (oder Wartungsmodus), dürfen sich nur BESTEHENDE User per Code einloggen
  // — für unbekannte E-Mails keine Neuanlage.
  const appConfig = await getAppConfig(event)
  if (!appConfig.registrationEnabled || appConfig.maintenanceMode) {
    // Case-insensitiv prüfen: Appwrite-Mails können gemischte Groß-/Kleinschreibung
    // haben, Query.equal wäre case-sensitiv → search + exakter Abgleich.
    const admin = createAdminClient(event)
    const found = await admin.users.list({ search: email })
    const exists = found.users.some(u => u.email.toLowerCase() === email)
    if (!exists) {
      throw createError({ status: 403, statusText: 'Registration is currently disabled' })
    }
  }

  const { account } = createSessionClient(event)

  const token = await account.createEmailToken({
    userId: ID.unique(),
    email,
    phrase: true,
  })

  return { ok: true, userId: token.userId, phrase: token.phrase }
})

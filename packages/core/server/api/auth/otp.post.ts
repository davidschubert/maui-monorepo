import { ID } from 'node-appwrite'
import { createSessionClient } from '../../lib/appwrite'
import { recoverySchema } from '../../../schemas/auth'

/**
 * Email-OTP anfordern (passwortloser Login). Läuft als GUEST — Appwrite
 * legt unbekannte E-Mails dabei automatisch als User an (Auto-Signup).
 * Die Security-Phrase geht in Mail UND Response — die UI zeigt sie an,
 * damit User die echte Mail von Phishing unterscheiden können.
 */
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, recoverySchema.parse)

  const { account } = createSessionClient(event)

  const token = await account.createEmailToken({
    userId: ID.unique(),
    email,
    phrase: true,
  })

  return { ok: true, userId: token.userId, phrase: token.phrase }
})

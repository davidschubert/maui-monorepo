import { createSessionClient } from '../../lib/appwrite'
import { recoverySchema } from '../../../schemas/auth'

/**
 * Recovery-Mail anfordern. Läuft als GUEST (SessionClient ohne Session) —
 * createRecovery ist ein Account-Endpoint, der API Key hat dafür bewusst
 * keinen Scope. Antwortet IMMER ok (keine Account-Enumeration);
 * die Nitro-Rate-Limit-Middleware drosselt zusätzlich.
 */
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, recoverySchema.parse)

  const origin = getRequestURL(event).origin
  const { account } = createSessionClient(event)

  try {
    await account.createRecovery({ email, url: `${origin}/reset-password` })
  }
  catch {
    // Unbekannte E-Mail etc. — nicht leaken, Antwort bleibt identisch
  }

  return { ok: true }
})

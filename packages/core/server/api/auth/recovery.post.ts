import { Query } from 'node-appwrite'
import { createSessionClient, createAdminClient } from '../../lib/appwrite'
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
    // Security-Signal ins Aktivitätsprotokoll — nur intern (admin-only Audit),
    // die Antwort bleibt in JEDEM Pfad identisch (keine Account-Enumeration).
    const { users } = createAdminClient(event)
    const match = await users.list({ queries: [Query.equal('email', email), Query.limit(1)] }).catch(() => null)
    const found = match?.users[0]
    if (found) {
      await logAuthEvent(event, 'user.recovery_requested', { userId: found.$id, name: found.name })
    }
  }
  catch {
    // Unbekannte E-Mail etc. — nicht leaken, Antwort bleibt identisch
  }

  return { ok: true }
})

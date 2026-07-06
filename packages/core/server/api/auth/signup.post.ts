import { AppwriteException, ID, Query } from 'node-appwrite'
import { createAdminClient, setSessionCookie } from '../../lib/appwrite'
import { registerSchema } from '../../../schemas/auth'

/**
 * Account + Session in einem Request (AdminClient: users.write + sessions.write).
 * Validierung zentral via Zod — ungültiger Body wirft 400.
 */
export default defineEventHandler(async (event) => {
  const appConfig = await getAppConfig(event)
  if (!appConfig.registrationEnabled || appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Registration is currently disabled' })
  }

  const { email, password, name } = await readValidatedBody(event, registerSchema.parse)
  const { account } = createAdminClient(event)

  // Appwrite-Fehler kapseln: doppelte E-Mail (409) sauber melden, Rest generisch —
  // keine Appwrite-Fehlerdetails an den Client leaken.
  let session
  try {
    await account.create({ userId: ID.unique(), email, password, name })
    session = await account.createEmailPasswordSession({ email, password })
  }
  catch (error) {
    if (error instanceof AppwriteException) {
      if (error.code === 409) {
        throw createError({ status: 409, statusText: 'Email already registered' })
      }
      // Das E-Mail-Format ist bereits Zod-validiert → ein 4xx von Appwrite hier
      // ist faktisch eine Email-Policy-Ablehnung (Wegwerf-/Free-Provider, seit
      // Appwrite 1.9.5 in Auth → Security konfigurierbar). 422 → eigene Meldung.
      if (error.code >= 400 && error.code < 500) {
        throw createError({ status: 422, statusText: 'Email not allowed' })
      }
    }
    throw createError({ status: 400, statusText: 'Registration failed' })
  }

  setSessionCookie(event, session.secret, session.expire)
  await logAuthEvent(event, 'user.login', { userId: session.userId, name, method: 'signup' })

  // Activity-Feed: „ist der Community beigetreten" (best-effort). Bewusst NUR
  // hier — der OTP-Flow legt User schon beim Token-Versand an (unverifiziert),
  // dort wäre der Eintrag verfrüht.
  await recordActivity(event, {
    actorId: session.userId,
    actorName: name,
    type: 'user.joined',
    objectType: 'user',
    objectId: session.userId,
    link: '/',
  })
  // Meilenstein („Die Community hat N Mitglieder") — best-effort wie der Feed
  const { users } = createAdminClient(event)
  const totalUsers = await users.list({ queries: [Query.limit(1)] }).then(r => r.total).catch(() => 0)
  await maybeRecordMilestone(event, { type: 'milestone.members', count: totalUsers })

  return { ok: true }
})

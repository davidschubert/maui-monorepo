import { AppwriteException, ID } from 'node-appwrite'
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
    if (error instanceof AppwriteException && error.code === 409) {
      throw createError({ status: 409, statusText: 'Email already registered' })
    }
    throw createError({ status: 400, statusText: 'Registration failed' })
  }

  setSessionCookie(event, session.secret, session.expire)
  await logAuthEvent(event, 'user.login', { userId: session.userId, name, method: 'signup' })

  return { ok: true }
})

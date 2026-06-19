import { ID } from 'node-appwrite'
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

  await account.create({ userId: ID.unique(), email, password, name })
  const session = await account.createEmailPasswordSession({ email, password })

  setSessionCookie(event, session.secret, session.expire)

  return { ok: true }
})

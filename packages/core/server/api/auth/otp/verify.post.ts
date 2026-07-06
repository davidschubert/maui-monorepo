import { Query } from 'node-appwrite'
import { createAdminClient, setSessionCookie } from '../../../lib/appwrite'
import { otpVerifySchema } from '../../../../schemas/auth'

/** Code prüfen → Session erzeugen → Cookie setzen (wie OAuth-Callback). */
export default defineEventHandler(async (event) => {
  const { userId, code } = await readValidatedBody(event, otpVerifySchema.parse)

  const { account, users } = createAdminClient(event)

  // Erst-Beitritt VOR der Session erkennen (der Login kippt emailVerification
  // auf true): OTP-Auto-Signups haben weder verifizierte E-Mail noch je ein
  // Passwort gesetzt. Passwort-User, die erstmals OTP nutzen, sind hier
  // bewusst raus — deren user.joined kam schon vom Signup.
  const before = await users.get({ userId }).catch(() => null)
  const isFirstJoin = !!before && !before.emailVerification && !before.passwordUpdate

  try {
    const session = await account.createSession({ userId, secret: code })
    setSessionCookie(event, session.secret, session.expire)
    await logAuthEvent(event, 'user.login', { userId: session.userId, method: 'otp' })

    if (isFirstJoin) {
      // Activity-Feed: der verifizierte OTP-Beitritt ist der Beitritts-Moment
      // (das Anlegen beim Token-Versand wäre verfrüht — unverifizierte E-Mail).
      await recordActivity(event, {
        actorId: session.userId,
        actorName: before.name,
        type: 'user.joined',
        objectType: 'user',
        objectId: session.userId,
        link: '/',
      })
      const totalUsers = await users.list({ queries: [Query.limit(1)] }).then(r => r.total).catch(() => 0)
      await maybeRecordMilestone(event, { type: 'milestone.members', count: totalUsers })
    }

    return { ok: true }
  }
  catch {
    // Falscher/abgelaufener Code — generisch, KEIN Cookie
    throw createError({ status: 401, statusText: 'Invalid or expired code' })
  }
})

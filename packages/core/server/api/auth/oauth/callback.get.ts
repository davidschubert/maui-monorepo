import { createAdminClient, setSessionCookie } from '../../../lib/appwrite'

// Locale-Prefix aus dem i18n_redirected-Cookie (Strategie prefix_except_default,
// en = Default ohne Prefix). Server-seitig gibt es kein localePath() — der
// externe Provider-Callback würde sonst einen DE-User immer auf die EN-Wurzel werfen.
function localePrefix(event: Parameters<typeof getCookie>[0]): string {
  const locale = getCookie(event, 'i18n_redirected')
  return locale && locale !== 'en' ? `/${encodeURIComponent(locale)}` : ''
}

export default defineEventHandler(async (event) => {
  const { userId, secret } = getQuery(event)
  const prefix = localePrefix(event)

  if (!userId || !secret) {
    return sendRedirect(event, `${prefix}/login?error=oauth`)
  }

  try {
    const { account } = createAdminClient(event)
    const session = await account.createSession({
      userId: String(userId),
      secret: String(secret),
    })

    setSessionCookie(event, session.secret, session.expire)
    return sendRedirect(event, `${prefix}/`)
  }
  catch {
    return sendRedirect(event, `${prefix}/login?error=oauth`)
  }
})

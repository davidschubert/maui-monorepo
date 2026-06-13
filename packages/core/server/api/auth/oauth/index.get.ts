import { OAuthProvider } from 'node-appwrite'
import { createAdminClient } from '../../../lib/appwrite'

/**
 * OAuth-Skeleton (Phase 4): startet den Redirect-Flow via createOAuth2Token.
 * Provider muss in der Appwrite Console konfiguriert sein.
 */
const SUPPORTED_PROVIDERS: Record<string, OAuthProvider> = {
  github: OAuthProvider.Github,
  google: OAuthProvider.Google,
}

export default defineEventHandler(async (event) => {
  const { provider = 'github' } = getQuery(event)
  const oauthProvider = SUPPORTED_PROVIDERS[String(provider)]

  if (!oauthProvider) {
    throw createError({ status: 400, statusText: 'Unsupported OAuth provider' })
  }

  const { account } = createAdminClient(event)
  const origin = getRequestURL(event).origin

  const url = await account.createOAuth2Token({
    provider: oauthProvider,
    success: `${origin}/api/auth/oauth/callback`,
    // i18n-Strategie 'prefix': '/login' existiert nur geprefixt — Default-Locale en
    failure: `${origin}/en/login?error=oauth`,
  })

  return sendRedirect(event, url)
})

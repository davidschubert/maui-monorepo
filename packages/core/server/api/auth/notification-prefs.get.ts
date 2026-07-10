/**
 * Aktuelle E-Mail-Benachrichtigungs-Präferenz + Versand-Verfügbarkeit
 * (Settings → Benachrichtigungen). mailerConfigured steuert nur den
 * UI-Hinweis — die Präferenz ist auch ohne SMTP speicherbar.
 */
export default defineEventHandler((event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const prefs = resolveEmailPrefs(event.context.user.prefs as Record<string, unknown>)
  return {
    emailNotifications: prefs.emailNotifications,
    mailerConfigured: isMailerConfigured(event),
  }
})

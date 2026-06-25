/**
 * Route-Middleware für Dashboard-Pages (UX-Schicht — die Autorität sind die
 * requirePermission()-Gates in den Server Routes). Ohne dashboard.access-
 * Capability: 403-Fehlerseite. (admin + moderator haben sie; siehe
 * docs/RBAC-CONCEPT.md.)
 */
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore()

  if (!auth.isLoggedIn) {
    return navigateTo(useLocalePath()('/login'))
  }

  if (!userHasCapability(auth.user, 'dashboard.access')) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
})

/**
 * Route-Middleware für Admin-Pages (UX-Schicht — die Autorität ist
 * requireAdmin() in den Server Routes). Ohne Admin-Label: 403-Fehlerseite.
 */
export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore()

  if (!auth.isLoggedIn) {
    return navigateTo(useLocalePath()('/login'))
  }

  if (!isAdminUser(auth.user)) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
})

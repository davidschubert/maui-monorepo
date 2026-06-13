/**
 * Route-Middleware für Gast-Pages (Login/Register): eingeloggte User → /
 */
export default defineNuxtRouteMiddleware(() => {
  if (useAuthStore().isLoggedIn) {
    return navigateTo(useLocalePath()('/'))
  }
})

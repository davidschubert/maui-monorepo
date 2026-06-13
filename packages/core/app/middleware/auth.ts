/**
 * Route-Middleware für geschützte Pages: definePageMeta({ middleware: 'auth' })
 */
export default defineNuxtRouteMiddleware(() => {
  if (!useAuthStore().isLoggedIn) {
    return navigateTo(useLocalePath()('/login'))
  }
})

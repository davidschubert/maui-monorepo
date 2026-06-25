/**
 * Route-Middleware für Dashboard-Pages (UX-Schicht — die Autorität sind die
 * requirePermission()-Gates in den Server Routes). Erfordert die dashboard.access-
 * Capability; eine Page kann via `definePageMeta({ requiredCapability })` eine
 * zusätzliche Capability verlangen (z.B. 'users.manage'). Siehe docs/RBAC-CONCEPT.md.
 */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()

  if (!auth.isLoggedIn) {
    return navigateTo(useLocalePath()('/login'))
  }

  if (!userHasCapability(auth.user, 'dashboard.access')) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  const required = to.meta.requiredCapability
  if (required && !userHasCapabilityName(auth.user, required)) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
})

declare module '#app' {
  interface PageMeta {
    /** Zusätzlich zu dashboard.access erforderliche Capability (RBAC). */
    requiredCapability?: string
  }
}

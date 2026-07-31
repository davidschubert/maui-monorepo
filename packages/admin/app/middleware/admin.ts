import type { Capability } from '../../../core/shared/types/authz'

/**
 * Route-Middleware für Dashboard-Pages (UX-Schicht — die Autorität sind die
 * requirePermission()/requireCommunityPermission()-Gates in den Server Routes).
 *
 * ZWEI Wege hinein (N1, analog decideCommunityAccess auf dem Server):
 *  1. Operator-Label (admin/moderator) mit dashboard.access — unverändert,
 *     inkl. Break-Glass auf Kunden-Sites.
 *  2. SITE-Rolle mit dashboard.access (useCommunityRole, SSR-gespiegelt): laut
 *     Rechte-Matrix in shared/communityAuthz.ts tragen ALLE fünf Site-Rollen
 *     (owner/admin/moderator/editor/viewer) dashboard.access — die Matrix ist
 *     die Quelle, hier wird nichts neu erfunden. Was jemand DRIN sieht,
 *     filtern Nav (dashboard-Layout) und `requiredCapability` je Page.
 *
 * Eine Page kann via `definePageMeta({ requiredCapability })` eine zusätzliche
 * Capability verlangen (z.B. 'users.manage') — auch die erfüllt entweder ein
 * Label ODER die Site-Rolle. Siehe docs/referenz/RBAC-CONCEPT.md.
 */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()

  if (!auth.isLoggedIn) {
    return navigateTo(useLocalePath()('/login'))
  }

  const { capabilities: siteCaps } = useCommunityRole()
  const can = (capability: Capability) =>
    userHasCapability(auth.user, capability) || siteCaps.value.has(capability)

  if (!can('dashboard.access')) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }

  const required = to.meta.requiredCapability
  // Unbekannte Namen ergeben in BEIDEN Prüfungen false (deny-by-default).
  if (required && !userHasCapabilityName(auth.user, required) && !siteCaps.value.has(required as Capability)) {
    throw createError({ status: 403, statusText: 'Forbidden' })
  }
})

declare module '#app' {
  interface PageMeta {
    /** Zusätzlich zu dashboard.access erforderliche Capability (RBAC). */
    requiredCapability?: string
  }
}

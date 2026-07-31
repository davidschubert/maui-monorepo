import { defineStore } from 'pinia'
import type { CurrentUser } from '../../shared/types/appwrite'
import { isTenantRole, type TenantRole } from '../../shared/tenantAuthz'

export type { CurrentUser }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<CurrentUser | null>(null)
  const isLoggedIn = computed(() => user.value !== null)

  // Site-Rolle (N1) folgt der Identität: SSR setzt sie via tenant-brand-Plugin
  // (expliziter Assign — s. dort), nach Client-Login holt refresh() sie nach,
  // Logout/Session-Ende nullt sie. Gleicher useState-Key wie useSiteRole().
  const siteRole = useState<TenantRole | null>('pukalani-site-role', () => null)

  function setUser(value: CurrentUser | null) {
    user.value = value
    // Ohne User gibt es keine Site-Rolle — sonst erbte der nächste Login im
    // selben Tab kurzzeitig die Capabilities des Vorgängers (UX-Schicht,
    // aber trotzdem falsch).
    if (value === null) siteRole.value = null
  }

  /** Eigene Site-Rolle nachziehen (fail-closed: jeder Fehler ⇒ keine Rolle). */
  async function refreshSiteRole() {
    try {
      const res = await $fetch<{ role: string | null }>('/api/site/role')
      siteRole.value = res.role && isTenantRole(res.role) ? res.role : null
    }
    catch {
      // 404 (Kontroll-Host ohne Präfix-Freigabe), Netz-Blip, … ⇒ keine Rolle.
      siteRole.value = null
    }
  }

  /** Holt den User vom Server nach (z.B. nach Login/Signup im Browser) */
  async function refresh() {
    try {
      // Parallel: die Rolle hängt nur am Session-Cookie, nicht an /me.
      const [me] = await Promise.all([
        $fetch<CurrentUser>('/api/auth/me'),
        refreshSiteRole(),
      ])
      user.value = me
    }
    catch (error) {
      // Nur bei echtem Auth-Fehler ausloggen — ein Netz-Blip oder 5xx darf die
      // lokale Session nicht fälschlich verwerfen (würde sonst Force-Logout +
      // „Sitzung widerrufen" auslösen, siehe realtime-account.client.ts).
      const status = (error as { status?: number, statusCode?: number }).status
        ?? (error as { statusCode?: number }).statusCode
      if (status === 401 || status === 403) {
        user.value = null
        siteRole.value = null
      }
    }
  }

  return { user, isLoggedIn, setUser, refresh }
})

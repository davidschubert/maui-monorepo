import { defineStore } from 'pinia'
import type { CurrentUser } from '../../shared/types/appwrite'
import { isCommunityRole, type CommunityRole } from '../../shared/communityAuthz'
import { normalizeTrustLevel, type TrustLevel } from '../../shared/trustLevel'

export type { CurrentUser }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<CurrentUser | null>(null)
  const isLoggedIn = computed(() => user.value !== null)

  // Site-Rolle (N1) folgt der Identität: SSR setzt sie via tenant-brand-Plugin
  // (expliziter Assign — s. dort), nach Client-Login holt refresh() sie nach,
  // Logout/Session-Ende nullt sie. Gleicher useState-Key wie useCommunityRole().
  const communityRole = useState<CommunityRole | null>('pukalani-community-role', () => null)
  // Vertrauensstufe (F1 Teilpaket 3) folgt derselben Identität und demselben
  // Weg wie die Rolle — dieselbe Route liefert beides, dieselbe Zeile nullt
  // beides beim Abmelden.
  const communityTrustLevel = useState<TrustLevel>('pukalani-community-trust-level', () => 0)

  function setUser(value: CurrentUser | null) {
    user.value = value
    // Ohne User gibt es keine Site-Rolle — sonst erbte der nächste Login im
    // selben Tab kurzzeitig die Capabilities des Vorgängers (UX-Schicht,
    // aber trotzdem falsch).
    if (value === null) {
      communityRole.value = null
      communityTrustLevel.value = 0
    }
  }

  /** Eigene Site-Rolle nachziehen (fail-closed: jeder Fehler ⇒ keine Rolle). */
  async function refreshSiteRole() {
    try {
      const res = await $fetch<{ role: string | null, trustLevel?: number }>('/api/community/role')
      communityRole.value = res.role && isCommunityRole(res.role) ? res.role : null
      communityTrustLevel.value = normalizeTrustLevel(res.trustLevel)
    }
    catch {
      // 404 (Kontroll-Host ohne Präfix-Freigabe), Netz-Blip, … ⇒ keine Rolle.
      communityRole.value = null
      communityTrustLevel.value = 0
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
        communityRole.value = null
      }
    }
  }

  return { user, isLoggedIn, setUser, refresh }
})

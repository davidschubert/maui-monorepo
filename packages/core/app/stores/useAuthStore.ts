import { defineStore } from 'pinia'
import type { CurrentUser } from '../../shared/types/appwrite'

export type { CurrentUser }

export const useAuthStore = defineStore('auth', () => {
  const user = ref<CurrentUser | null>(null)
  const isLoggedIn = computed(() => user.value !== null)

  function setUser(value: CurrentUser | null) {
    user.value = value
  }

  /** Holt den User vom Server nach (z.B. nach Login/Signup im Browser) */
  async function refresh() {
    try {
      user.value = await $fetch<CurrentUser>('/api/auth/me')
    }
    catch (error) {
      // Nur bei echtem Auth-Fehler ausloggen — ein Netz-Blip oder 5xx darf die
      // lokale Session nicht fälschlich verwerfen (würde sonst Force-Logout +
      // „Sitzung widerrufen" auslösen, siehe realtime-account.client.ts).
      const status = (error as { status?: number, statusCode?: number }).status
        ?? (error as { statusCode?: number }).statusCode
      if (status === 401 || status === 403) user.value = null
    }
  }

  return { user, isLoggedIn, setUser, refresh }
})

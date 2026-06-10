import { storeToRefs } from 'pinia'

/**
 * Bequemer lesender Zugriff auf den Auth-State (SSR-hydratisiert
 * via plugins/auth.server.ts). Mutationen laufen über useAuthStore.
 */
export function useCurrentUser() {
  const { user, isLoggedIn } = storeToRefs(useAuthStore())
  return { user, isLoggedIn }
}

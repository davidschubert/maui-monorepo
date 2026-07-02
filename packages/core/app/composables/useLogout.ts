/**
 * Gemeinsamer Logout-Flow (UserMenu, LogoutButton, DashboardUserMenu):
 * 1. Presence sofort abräumen (best effort, VOR dem Session-Ende — danach hätte
 *    der Beacon keine Session mehr) — sonst bleibt der User bis zur Expiry
 *    (~90s) für andere „online".
 * 2. Session server-seitig beenden; Fehler werden abgefangen (kein unhandled
 *    rejection aus onSelect-Handlern) und als Toast gemeldet.
 */
export function useLogout() {
  const { t } = useI18n()
  const localePath = useLocalePath()
  const auth = useAuthStore()
  const toast = useToast()
  const loading = ref(false)

  async function logout() {
    if (loading.value) return
    loading.value = true
    try {
      if (auth.user) {
        try {
          navigator.sendBeacon('/api/presence/leave')
        }
        catch { /* best effort — Expiry räumt sonst ab */ }
      }
      await $fetch('/api/auth/logout', { method: 'POST' })
      auth.setUser(null)
      toast.add({ title: t('auth.logoutSuccess'), color: 'success', icon: 'i-ph-sign-out' })
      await navigateTo(localePath('/login'))
    }
    catch {
      toast.add({ title: t('auth.logoutError'), color: 'error', icon: 'i-ph-warning' })
    }
    finally {
      loading.value = false
    }
  }

  return { logout, loading }
}

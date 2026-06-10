import { defineStore } from 'pinia'
import type { Models } from 'node-appwrite'

export type CurrentUser = Models.User<Models.Preferences>

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
    catch {
      user.value = null
    }
  }

  return { user, isLoggedIn, setUser, refresh }
})

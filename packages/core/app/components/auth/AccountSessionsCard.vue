<script setup lang="ts">
import type { UserSession, UserSessionListResponse } from '../../../shared/types/session'

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()

// Private, per-User-Daten ohne SEO-Relevanz → client-seitig laden (kein SSR-Render,
// damit kein Hydration-Mismatch über die NuxtPage-Async-Komponenten-Grenze entsteht).
const { data, refresh } = useFetch<UserSessionListResponse>('/api/auth/sessions', {
  lazy: true,
  server: false,
})

// Live: Liste aktualisieren, wenn sich Sessions ändern (Abmeldung auf anderem
// Gerät, Widerruf durch Admin) — entprellt.
let liveTimer: ReturnType<typeof setTimeout> | undefined
useRealtimeAccount(() => {
  clearTimeout(liveTimer)
  liveTimer = setTimeout(() => { void refresh() }, 400)
})
onScopeDispose(() => clearTimeout(liveTimer))

const confirmAll = ref(false)
const busyId = ref<string | null>(null)
const busyAll = ref(false)

/** Eigene Session(s) beendet → ausloggen und zur Startseite */
async function signOutSelf() {
  auth.setUser(null)
  await navigateTo(localePath('/'))
}

async function signOut(session: UserSession) {
  busyId.value = session.$id
  try {
    const result = await $fetch<{ ok: boolean, self: boolean }>(`/api/auth/sessions/${session.$id}`, { method: 'DELETE' })
    toast.add({ title: t('account.sessions.signedOut'), color: 'success' })
    if (result.self) return await signOutSelf()
    await refresh()
  }
  catch {
    toast.add({ title: t('account.sessions.signOutFailed'), color: 'error' })
  }
  finally {
    busyId.value = null
  }
}

async function signOutAll() {
  busyAll.value = true
  try {
    await $fetch('/api/auth/sessions', { method: 'DELETE' })
    confirmAll.value = false
    toast.add({ title: t('account.sessions.signedOut'), color: 'success' })
    await signOutSelf()
  }
  catch {
    toast.add({ title: t('account.sessions.signOutFailed'), color: 'error' })
    busyAll.value = false
  }
}
</script>

<template>
  <UPageCard :title="t('account.sessions.title')" :description="t('account.sessions.description')" variant="subtle" :ui="{ container: 'min-w-0' }">
    <template #footer>
      <UButton
        color="error"
        variant="subtle"
        icon="i-ph-sign-out"
        :disabled="(data?.sessions.length ?? 0) === 0"
        @click="() => { confirmAll = true }"
      >
        {{ t('account.sessions.signOutAll') }}
      </UButton>
    </template>

    <ClientOnly>
      <template #fallback>
        <div class="flex justify-center py-8">
          <UIcon name="i-ph-spinner" class="size-5 animate-spin text-muted" />
        </div>
      </template>
      <SessionsTable :sessions="data?.sessions ?? []">
        <template #actions="{ session }">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="busyId === session.$id"
            @click="signOut(session as UserSession)"
          >
            {{ t('account.sessions.signOut') }}
          </UButton>
        </template>
      </SessionsTable>
    </ClientOnly>

    <UModal v-model:open="confirmAll" :title="t('account.sessions.confirmAllTitle')">
      <template #body>
        <p class="text-sm">{{ t('account.sessions.confirmAllText') }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { confirmAll = false }">{{ t('account.sessions.cancel') }}</UButton>
          <UButton color="error" :loading="busyAll" @click="signOutAll">{{ t('account.sessions.confirmAll') }}</UButton>
        </div>
      </template>
    </UModal>
  </UPageCard>
</template>

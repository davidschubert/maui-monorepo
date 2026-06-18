<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { UserSession, UserSessionListResponse } from '../../../shared/types/session'

const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()

// Private, per-User-Daten ohne SEO-Relevanz → client-seitig laden (kein SSR-Render,
// damit kein Hydration-Mismatch über die NuxtPage-Async-Komponenten-Grenze entsteht).
const { data, refresh, status } = useFetch<UserSessionListResponse>('/api/auth/sessions', {
  lazy: true,
  server: false,
})

const confirmAll = ref(false)
const busyId = ref<string | null>(null)
const busyAll = ref(false)

/** "Chrome 146.0" — leere Teile auslassen */
function browserLabel(session: UserSession): string {
  return [session.clientName, session.clientVersion].filter(Boolean).join(' ').trim()
}
/** "macOS 10.15" — leere Teile auslassen */
function osLabel(session: UserSession): string {
  return [session.osName, session.osVersion].filter(Boolean).join(' ').trim()
}

/** Browser-Logo (Phosphor) — spezifisch für Chrome, sonst generisch */
function browserIcon(clientName: string): string {
  return clientName.toLowerCase().includes('chrome') ? 'i-ph-google-chrome-logo' : 'i-ph-browser'
}
/** OS-Logo (Phosphor) anhand des OS-Namens */
function osIcon(osName: string): string {
  const os = osName.toLowerCase()
  if (os.includes('mac') || os.includes('os x') || os.includes('ios')) return 'i-ph-apple-logo'
  if (os.includes('windows')) return 'i-ph-windows-logo'
  if (os.includes('android')) return 'i-ph-android-logo'
  if (os.includes('linux') || os.includes('ubuntu') || os.includes('debian')) return 'i-ph-linux-logo'
  return 'i-ph-desktop'
}

const columns: TableColumn<UserSession>[] = [
  { accessorKey: 'client', header: () => t('account.sessions.client') },
  { accessorKey: 'location', header: () => t('account.sessions.location') },
  { accessorKey: 'ip', header: () => t('account.sessions.ip') },
  { id: 'actions', header: () => '' },
]

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
  <UPageCard :title="t('account.sessions.title')" :description="t('account.sessions.description')" variant="subtle">
    <template #footer>
      <UButton
        color="error"
        variant="subtle"
        icon="i-ph-sign-out"
        :disabled="(data?.sessions.length ?? 0) === 0"
        @click="confirmAll = true"
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
      <UTable :data="data?.sessions ?? []" :columns="columns" :loading="status === 'pending'">
      <template #client-cell="{ row }">
        <div class="flex flex-col gap-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <UIcon :name="browserIcon(row.original.clientName)" class="size-4 shrink-0 text-muted" />
            <span class="font-medium">{{ browserLabel(row.original) || t('account.sessions.unknown') }}</span>
            <UBadge v-if="row.original.provider" color="neutral" variant="subtle" size="sm">{{ row.original.provider }}</UBadge>
            <UBadge v-if="row.original.current" color="success" variant="subtle" size="sm">{{ t('account.sessions.current') }}</UBadge>
          </div>
          <div v-if="osLabel(row.original)" class="flex items-center gap-1.5 text-xs text-muted">
            <UIcon :name="osIcon(row.original.osName)" class="size-3.5 shrink-0" />
            <span>{{ osLabel(row.original) }}</span>
          </div>
        </div>
      </template>
      <template #location-cell="{ row }">
        <span :class="row.original.countryName ? '' : 'text-muted'">{{ row.original.countryName || t('account.sessions.unknown') }}</span>
      </template>
      <template #ip-cell="{ row }">
        <span class="tabular-nums">{{ row.original.ip || '—' }}</span>
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end">
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="busyId === row.original.$id"
            @click="signOut(row.original)"
          >
            {{ t('account.sessions.signOut') }}
          </UButton>
        </div>
      </template>
      </UTable>
    </ClientOnly>

    <UModal v-model:open="confirmAll" :title="t('account.sessions.confirmAllTitle')">
      <template #body>
        <p class="text-sm">{{ t('account.sessions.confirmAllText') }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="confirmAll = false">{{ t('account.sessions.cancel') }}</UButton>
          <UButton color="error" :loading="busyAll" @click="signOutAll">{{ t('account.sessions.confirmAll') }}</UButton>
        </div>
      </template>
    </UModal>
  </UPageCard>
</template>

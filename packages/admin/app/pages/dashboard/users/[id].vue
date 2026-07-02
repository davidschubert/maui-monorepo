<script setup lang="ts">
import type { AdminUserDetailResponse } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'users.manage' })

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()
const { user: me } = useCurrentUser()
const { formatRelativeTime } = useFormatRelativeTime()

const userId = computed(() => String(route.params.id))

const { data, refresh } = await useFetch<AdminUserDetailResponse>(() => `/api/admin/users/${userId.value}`)

const user = computed(() => data.value?.user ?? null)
const isSelf = computed(() => user.value?.$id === me.value?.$id)
// Live-Online: überlagert den Lade-Snapshot (user.online) mit der aktuellen
// Presence, damit der Status ohne Reload stimmt (wie in der Users-Liste).
const { present } = usePresence()
const isOnline = computed(() => present.value.some(u => u.userId === userId.value) || !!user.value?.online)
const memberSince = computed(() =>
  user.value ? new Date(user.value.registration).toLocaleDateString(locale.value, { month: 'short', year: 'numeric' }) : '',
)

const pending = ref<{ type: 'block' | 'unblock' | 'sessions' | 'delete' } | null>(null)
const busy = ref(false)
const exporting = ref(false)

// --- Rollen (Mehrfachauswahl) -------------------------------------------------
const assignableRoles = ASSIGNABLE_ROLES
const roleSet = new Set<string>(ASSIGNABLE_ROLES)
const currentRoles = computed(() => (user.value?.labels ?? []).filter(label => roleSet.has(label)))
const selectedRoles = ref<string[]>([])
watch(currentRoles, roles => { selectedRoles.value = [...roles] }, { immediate: true })

const rolesChanged = computed(() =>
  currentRoles.value.length !== selectedRoles.value.length
  || currentRoles.value.some(role => !selectedRoles.value.includes(role)),
)
const savingRoles = ref(false)

function toggleRole(role: string, on: boolean) {
  if (on) {
    if (!selectedRoles.value.includes(role)) selectedRoles.value = [...selectedRoles.value, role]
  }
  else {
    selectedRoles.value = selectedRoles.value.filter(r => r !== role)
  }
}

async function saveRoles() {
  if (!user.value || !rolesChanged.value) return
  savingRoles.value = true
  try {
    await $fetch(`/api/admin/users/${user.value.$id}/role`, { method: 'PATCH', body: { roles: selectedRoles.value } })
    toast.add({ title: t('admin.users.rolesSaved'), color: 'success' })
    await refresh()
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    toast.add({ title: code === 'last_admin' ? t('admin.users.lastAdmin') : t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    savingRoles.value = false
  }
}

function exactDateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale.value, {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

async function copyId() {
  if (!user.value) return
  try {
    await navigator.clipboard.writeText(user.value.$id)
    toast.add({ title: t('admin.users.detail.copied'), color: 'success' })
  }
  catch {
    // Clipboard nicht verfügbar — still ignorieren
  }
}

async function exportData() {
  if (!user.value) return
  exporting.value = true
  try {
    const payload = await $fetch(`/api/admin/users/${user.value.$id}/export`)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `user-${user.value.$id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    exporting.value = false
  }
}

const confirmText = computed(() => {
  if (!pending.value || !user.value) return ''
  return t(`admin.users.confirm.${pending.value.type}`, { name: user.value.name })
})

async function executePending() {
  if (!pending.value || !user.value) return
  busy.value = true
  const { type } = pending.value
  try {
    if (type === 'sessions') {
      const result = await $fetch<{ ok: boolean, self: boolean }>(`/api/admin/users/${user.value.$id}/sessions`, { method: 'DELETE' })
      toast.add({ title: t('admin.users.sessionsCleared'), color: 'success' })
      if (result.self) {
        pending.value = null
        auth.setUser(null)
        await navigateTo(localePath('/'))
        return
      }
    }
    else if (type === 'delete') {
      await $fetch(`/api/admin/users/${user.value.$id}`, { method: 'DELETE' })
      toast.add({ title: t('admin.users.deleted'), color: 'success' })
      pending.value = null
      await navigateTo(localePath('/dashboard/users'))
      return
    }
    else {
      await $fetch(`/api/admin/users/${user.value.$id}/status`, { method: 'PATCH', body: { blocked: type === 'block' } })
      toast.add({ title: t(type === 'block' ? 'admin.users.blocked' : 'admin.users.unblocked'), color: 'success' })
    }
    pending.value = null
    await refresh()
  }
  catch (error) {
    const code = (error as { data?: { data?: { code?: string } } })?.data?.data?.code
    toast.add({ title: code === 'last_admin' ? t('admin.users.lastAdmin') : t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="user-detail" :ui="{ body: 'lg:py-8' }">
    <template #header>
      <UDashboardNavbar :title="t('admin.users.detail.profile')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-arrow-left" color="neutral" variant="ghost" :to="localePath('/dashboard/users')">
            {{ t('admin.users.detail.back') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="user" class="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-6">
        <!-- Hero: Identität + Status/Rollen + benigne Schnellaktionen -->
        <UPageCard variant="subtle">
          <div class="flex flex-wrap items-center gap-4 sm:gap-5">
            <UChip :show="isOnline" color="success" position="bottom-right" inset size="3xl">
              <UserAvatar :user="{ name: user.name, email: user.email, prefs: { avatarUrl: user.avatarUrl } }" size="3xl" />
            </UChip>
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-xl font-semibold">{{ user.name }}</h2>
              <p class="truncate text-sm text-muted">{{ user.email }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <UBadge :color="user.status ? 'success' : 'error'" variant="subtle" size="sm">
                  {{ user.status ? t('admin.users.active') : t('admin.users.blockedBadge') }}
                </UBadge>
                <UBadge v-for="role in currentRoles" :key="role" :color="role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                  {{ t(`admin.roles.${role}`) }}
                </UBadge>
                <UBadge v-if="!currentRoles.length" color="neutral" variant="subtle" size="sm">{{ t('admin.users.detail.roleUser') }}</UBadge>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton color="neutral" variant="subtle" icon="i-ph-download-simple" :loading="exporting" @click="exportData">
                {{ t('admin.users.export') }}
              </UButton>
              <UButton color="neutral" variant="subtle" icon="i-ph-sign-out" @click="pending = { type: 'sessions' }">
                {{ t('admin.users.clearSessions') }}
              </UButton>
            </div>
          </div>
        </UPageCard>

        <!-- Kennzahlen -->
        <div class="grid gap-3 sm:grid-cols-3">
          <UPageCard variant="subtle">
            <p class="text-sm text-muted">{{ t('admin.users.detail.stats.comments') }}</p>
            <p class="text-2xl font-bold tabular-nums">{{ data?.commentsTotal ?? 0 }}</p>
          </UPageCard>
          <UPageCard variant="subtle">
            <p class="text-sm text-muted">{{ t('admin.users.detail.stats.sessions') }}</p>
            <p class="text-2xl font-bold tabular-nums">{{ data?.sessions.length ?? 0 }}</p>
          </UPageCard>
          <UPageCard variant="subtle">
            <p class="text-sm text-muted">{{ t('admin.users.detail.stats.memberSince') }}</p>
            <p class="text-2xl font-bold">{{ memberSince }}</p>
          </UPageCard>
        </div>

        <!-- Zweispaltig: Inhalt links, Steuerung rechts -->
        <div class="grid gap-4 sm:gap-6 lg:grid-cols-3 lg:items-start">
          <div class="flex flex-col gap-4 sm:gap-6 lg:col-span-2">
            <!-- Account-Details -->
            <UPageCard :title="t('admin.users.detail.accountDetails')" variant="subtle">
              <dl class="text-sm">
                <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
                  <dt class="text-muted">{{ t('admin.users.email') }}</dt>
                  <dd class="flex min-w-0 items-center gap-1.5">
                    <UIcon :name="user.emailVerification ? 'i-ph-seal-check' : 'i-ph-warning-circle'" :class="user.emailVerification ? 'text-success' : 'text-muted'" class="size-4 shrink-0" />
                    <span class="truncate">{{ user.email }}</span>
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
                  <dt class="text-muted">{{ t('admin.users.detail.phone') }}</dt>
                  <dd class="flex items-center gap-1.5 font-mono">
                    <UIcon v-if="user.phone" :name="user.phoneVerification ? 'i-ph-seal-check' : 'i-ph-warning-circle'" :class="user.phoneVerification ? 'text-success' : 'text-muted'" class="size-4" />
                    {{ user.phone || '—' }}
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
                  <dt class="text-muted">{{ t('admin.users.joined') }}</dt>
                  <dd>{{ formatRelativeTime(user.registration) }} <span class="text-muted">({{ exactDateTime(user.registration) }})</span></dd>
                </div>
                <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
                  <dt class="text-muted">{{ t('admin.users.lastActivity') }}</dt>
                  <dd v-if="user.accessedAt">{{ formatRelativeTime(user.accessedAt) }} <span class="text-muted">({{ exactDateTime(user.accessedAt) }})</span></dd>
                  <dd v-else class="text-muted">—</dd>
                </div>
                <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
                  <dt class="text-muted">{{ t('admin.users.detail.userId') }}</dt>
                  <dd class="flex items-center gap-1.5">
                    <span class="font-mono text-muted">{{ user.$id }}</span>
                    <UButton icon="i-ph-copy" color="neutral" variant="ghost" size="xs" :aria-label="t('admin.users.detail.copy')" @click="copyId" />
                  </dd>
                </div>
                <div class="flex items-start justify-between gap-4 py-2.5">
                  <dt class="shrink-0 text-muted">{{ t('admin.users.detail.bio') }}</dt>
                  <dd class="text-right">{{ user.bio || '—' }}</dd>
                </div>
              </dl>
            </UPageCard>

            <!-- Letzte Kommentare -->
            <UPageCard variant="subtle">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="font-semibold">{{ t('admin.users.detail.comments') }}</h3>
                <UBadge color="neutral" variant="subtle">{{ t('admin.users.detail.commentsTotal', { count: data?.commentsTotal ?? 0 }) }}</UBadge>
              </div>
              <p v-if="(data?.comments.length ?? 0) === 0" class="text-sm text-muted">{{ t('admin.users.detail.noComments') }}</p>
              <ul v-else class="space-y-3">
                <li v-for="comment in data?.comments" :key="comment.$id" class="border-b border-default/60 pb-3 text-sm last:border-0 last:pb-0">
                  <div class="mb-1 flex items-center gap-2">
                    <UBadge :color="comment.status === 'active' ? 'success' : 'neutral'" variant="subtle" size="sm">
                      {{ t(`admin.moderation.status.${comment.status}`) }}
                    </UBadge>
                    <span class="text-xs text-muted">{{ formatRelativeTime(comment.$createdAt) }}</span>
                  </div>
                  <p class="line-clamp-3 whitespace-pre-wrap">{{ comment.content }}</p>
                </li>
              </ul>
            </UPageCard>

            <!-- Sessions -->
            <UPageCard variant="subtle">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="font-semibold">{{ t('admin.users.detail.sessions') }}</h3>
                <UBadge color="neutral" variant="subtle">{{ data?.sessions.length ?? 0 }}</UBadge>
              </div>
              <p v-if="(data?.sessions.length ?? 0) === 0" class="text-sm text-muted">{{ t('admin.users.detail.noSessions') }}</p>
              <SessionsTable v-else :sessions="data?.sessions ?? []" />
            </UPageCard>
          </div>

          <!-- Steuerung (sticky) -->
          <div class="flex flex-col gap-4 sm:gap-6 lg:sticky lg:top-6 lg:self-start">
            <!-- Rollen -->
            <UPageCard
              :title="t('admin.users.detail.actions.roles')"
              :description="t('admin.users.detail.actions.rolesHint')"
              variant="subtle"
            >
              <div class="space-y-2.5">
                <UCheckbox
                  v-for="role in assignableRoles"
                  :key="role"
                  :model-value="selectedRoles.includes(role)"
                  :label="t(`admin.roles.${role}`)"
                  :disabled="role === 'admin' && isSelf"
                  @update:model-value="(value: boolean | 'indeterminate') => toggleRole(role, value === true)"
                />
                <UButton size="sm" block :disabled="!rolesChanged" :loading="savingRoles" @click="saveRoles">
                  {{ t('ui.save') }}
                </UButton>
              </div>
            </UPageCard>

            <!-- Gefahrenzone -->
            <UPageCard variant="subtle" class="ring ring-error/30">
              <p class="mb-3 flex items-center gap-1.5 text-sm font-semibold text-error">
                <UIcon name="i-ph-warning" class="size-4" />{{ t('admin.users.detail.dangerZone') }}
              </p>
              <div class="space-y-2">
                <UButton
                  v-if="user.status"
                  block color="error" variant="subtle" icon="i-ph-prohibit" :disabled="isSelf"
                  @click="pending = { type: 'block' }"
                >
                  {{ t('admin.users.block') }}
                </UButton>
                <UButton v-else block color="success" variant="subtle" icon="i-ph-lock-open" @click="pending = { type: 'unblock' }">
                  {{ t('admin.users.unblock') }}
                </UButton>
                <UButton block color="error" variant="subtle" icon="i-ph-trash" :disabled="isSelf" @click="pending = { type: 'delete' }">
                  {{ t('admin.users.deleteUser') }}
                </UButton>
              </div>
            </UPageCard>
          </div>
        </div>
      </div>

      <div v-else class="py-16 text-center text-muted">
        {{ t('admin.users.notFound') }}
      </div>

      <UModal :open="pending !== null" :title="t('admin.users.confirmTitle')" @update:open="(value: boolean) => { if (!value) pending = null }">
        <template #body>
          <p class="text-sm">{{ confirmText }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="pending = null">{{ t('ui.cancel') }}</UButton>
            <UButton :color="pending?.type === 'block' || pending?.type === 'delete' ? 'error' : 'primary'" :loading="busy" @click="executePending">
              {{ t('admin.users.confirmAction') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

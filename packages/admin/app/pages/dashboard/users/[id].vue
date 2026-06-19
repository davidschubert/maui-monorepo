<script setup lang="ts">
import type { AdminUserDetailResponse, AdminUserSession } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()
const { user: me } = useCurrentUser()
const { formatRelativeTime } = useFormatRelativeTime()

const userId = computed(() => String(route.params.id))

const { data, refresh } = await useFetch<AdminUserDetailResponse>(() => `/api/admin/users/${userId.value}`)

const user = computed(() => data.value?.user ?? null)
const isSelf = computed(() => user.value?.$id === me.value?.$id)
const isAdmin = computed(() => user.value?.labels.includes('admin') ?? false)

const pending = ref<{ type: 'block' | 'unblock' | 'sessions' | 'grant' | 'revoke' | 'delete' } | null>(null)
const busy = ref(false)
const exporting = ref(false)

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

function clientLabel(s: AdminUserSession): string {
  const browser = [s.clientName, s.clientVersion].filter(Boolean).join(' ').trim()
  const os = [s.osName, s.osVersion].filter(Boolean).join(' ').trim()
  return [browser, os].filter(Boolean).join(' · ') || '—'
}

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
    else if (type === 'grant' || type === 'revoke') {
      await $fetch(`/api/admin/users/${user.value.$id}/role`, { method: 'PATCH', body: { admin: type === 'grant' } })
      toast.add({ title: t(type === 'grant' ? 'admin.users.roleGranted' : 'admin.users.roleRevoked'), color: 'success' })
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
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="user-detail" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar :title="user?.name || t('admin.nav.users')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrow-left"
            color="neutral"
            variant="ghost"
            :to="localePath('/dashboard/users')"
          >
            {{ t('admin.users.detail.back') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="user" class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:max-w-3xl lg:gap-8">
        <!-- Profile -->
        <UPageCard variant="subtle">
          <div class="flex flex-wrap items-center gap-4">
            <UserAvatar :user="{ name: user.name, email: user.email, prefs: { avatarUrl: user.avatarUrl } }" size="2xl" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-semibold">{{ user.name }}</h2>
                <UBadge :color="user.status ? 'success' : 'error'" variant="subtle" size="sm">
                  {{ user.status ? t('admin.users.active') : t('admin.users.blockedBadge') }}
                </UBadge>
                <UBadge v-for="label in user.labels" :key="label" color="neutral" variant="subtle" size="sm">{{ label }}</UBadge>
              </div>
              <p class="truncate text-sm text-muted">{{ user.email }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="user.status"
                color="error" variant="subtle" size="sm" icon="i-ph-prohibit"
                :disabled="isSelf"
                @click="pending = { type: 'block' }"
              >
                {{ t('admin.users.block') }}
              </UButton>
              <UButton v-else color="success" variant="subtle" size="sm" icon="i-ph-lock-open" @click="pending = { type: 'unblock' }">
                {{ t('admin.users.unblock') }}
              </UButton>
              <UButton color="neutral" variant="subtle" size="sm" icon="i-ph-sign-out" @click="pending = { type: 'sessions' }">
                {{ t('admin.users.clearSessions') }}
              </UButton>
              <UButton
                v-if="!isAdmin"
                color="primary" variant="subtle" size="sm" icon="i-ph-shield-star"
                @click="pending = { type: 'grant' }"
              >
                {{ t('admin.users.makeAdmin') }}
              </UButton>
              <UButton
                v-else
                color="warning" variant="subtle" size="sm" icon="i-ph-shield-slash"
                :disabled="isSelf"
                @click="pending = { type: 'revoke' }"
              >
                {{ t('admin.users.revokeAdmin') }}
              </UButton>
              <UButton color="neutral" variant="subtle" size="sm" icon="i-ph-download-simple" :loading="exporting" @click="exportData">
                {{ t('admin.users.export') }}
              </UButton>
              <UButton
                color="error" variant="subtle" size="sm" icon="i-ph-trash"
                :disabled="isSelf"
                @click="pending = { type: 'delete' }"
              >
                {{ t('admin.users.deleteUser') }}
              </UButton>
            </div>
          </div>

          <USeparator class="my-4" />

          <dl class="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
              <dt class="text-muted">{{ t('admin.users.email') }}</dt>
              <dd class="flex items-center gap-1.5">
                <UIcon :name="user.emailVerification ? 'i-ph-seal-check' : 'i-ph-warning-circle'" :class="user.emailVerification ? 'text-success' : 'text-muted'" class="size-4" />
                <span class="truncate">{{ user.email }}</span>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
              <dt class="text-muted">{{ t('admin.users.detail.phone') }}</dt>
              <dd class="flex items-center gap-1.5 font-mono">
                <UIcon v-if="user.phone" :name="user.phoneVerification ? 'i-ph-seal-check' : 'i-ph-warning-circle'" :class="user.phoneVerification ? 'text-success' : 'text-muted'" class="size-4" />
                {{ user.phone || '—' }}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
              <dt class="text-muted">{{ t('admin.users.joined') }}</dt>
              <dd :title="formatDate(user.registration)">{{ formatRelativeTime(user.registration) }}</dd>
            </div>
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2">
              <dt class="text-muted">{{ t('admin.users.lastActivity') }}</dt>
              <dd v-if="user.accessedAt" :title="formatDate(user.accessedAt)">{{ formatRelativeTime(user.accessedAt) }}</dd>
              <dd v-else class="text-muted">—</dd>
            </div>
            <div class="flex items-center justify-between gap-4 py-2 sm:col-span-2">
              <dt class="text-muted">{{ t('admin.users.detail.userId') }}</dt>
              <dd class="font-mono text-muted">{{ user.$id }}</dd>
            </div>
          </dl>

          <div v-if="user.bio" class="mt-2">
            <p class="text-sm text-muted">{{ t('admin.users.detail.bio') }}</p>
            <p class="text-sm">{{ user.bio }}</p>
          </div>
        </UPageCard>

        <!-- Sessions -->
        <UPageCard :title="t('admin.users.detail.sessions')" variant="subtle">
          <div v-if="(data?.sessions.length ?? 0) === 0" class="text-sm text-muted">{{ t('admin.users.detail.noSessions') }}</div>
          <dl v-else class="text-sm">
            <div
              v-for="session in data?.sessions"
              :key="session.$id"
              class="flex flex-wrap items-center justify-between gap-2 border-b border-default/60 py-2 last:border-0"
            >
              <div class="flex items-center gap-2">
                <UIcon name="i-ph-desktop" class="size-4 shrink-0 text-muted" />
                <span>{{ clientLabel(session) }}</span>
                <UBadge v-if="session.current" color="success" variant="subtle" size="sm">{{ t('admin.users.detail.current') }}</UBadge>
              </div>
              <span class="font-mono text-muted">{{ session.ip || '—' }}<template v-if="session.countryName"> · {{ session.countryName }}</template></span>
            </div>
          </dl>
        </UPageCard>

        <!-- Comments -->
        <UPageCard variant="subtle">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold">{{ t('admin.users.detail.comments') }}</h3>
            <UBadge color="neutral" variant="subtle">{{ t('admin.users.detail.commentsTotal', { count: data?.commentsTotal ?? 0 }) }}</UBadge>
          </div>
          <div v-if="(data?.comments.length ?? 0) === 0" class="text-sm text-muted">{{ t('admin.users.detail.noComments') }}</div>
          <ul v-else class="space-y-3">
            <li v-for="comment in data?.comments" :key="comment.$id" class="border-b border-default/60 pb-3 text-sm last:border-0 last:pb-0">
              <div class="mb-1 flex items-center gap-2">
                <UBadge :color="comment.status === 'active' ? 'success' : comment.status === 'reported' ? 'warning' : 'neutral'" variant="subtle" size="sm">
                  {{ t(`admin.moderation.status.${comment.status}`) }}
                </UBadge>
                <span class="text-xs text-muted" :title="formatDate(comment.$createdAt)">{{ formatRelativeTime(comment.$createdAt) }}</span>
              </div>
              <p class="line-clamp-3 whitespace-pre-wrap">{{ comment.content }}</p>
            </li>
          </ul>
        </UPageCard>
      </div>

      <div v-else class="py-16 text-center text-muted">
        {{ t('admin.nav.users') }} — 404
      </div>

      <UModal :open="pending !== null" :title="t('admin.users.confirmTitle')" @update:open="(value: boolean) => { if (!value) pending = null }">
        <template #body>
          <p class="text-sm">{{ confirmText }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="pending = null">{{ t('comments.item.cancel') }}</UButton>
            <UButton :color="pending?.type === 'block' || pending?.type === 'delete' ? 'error' : 'primary'" :loading="busy" @click="executePending">
              {{ t('admin.users.confirmAction') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

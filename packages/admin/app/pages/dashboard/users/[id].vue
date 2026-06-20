<script setup lang="ts">
import type { AdminUserDetailResponse } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

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
const isAdmin = computed(() => user.value?.labels.includes('admin') ?? false)

const pending = ref<{ type: 'block' | 'unblock' | 'sessions' | 'grant' | 'revoke' | 'delete' } | null>(null)
const busy = ref(false)
const exporting = ref(false)

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
  <UDashboardPanel id="user-detail" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar :title="user?.name || t('admin.nav.users')">
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
      <div v-if="user" class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:max-w-3xl lg:gap-8">
        <!-- Identity -->
        <UPageCard variant="subtle">
          <div class="flex flex-wrap items-center gap-5">
            <UserAvatar :user="{ name: user.name, email: user.email, prefs: { avatarUrl: user.avatarUrl } }" size="3xl" />
            <div class="min-w-0 flex-1">
              <h2 class="text-xl font-semibold">{{ user.name }}</h2>
              <p class="truncate text-sm text-muted">{{ user.email }}</p>
            </div>
          </div>
        </UPageCard>

        <!-- Account Details -->
        <UPageCard :title="t('admin.users.detail.accountDetails')" variant="subtle">
          <dl class="text-sm">
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
              <dt class="text-muted">{{ t('admin.users.status') }}</dt>
              <dd>
                <UBadge :color="user.status ? 'success' : 'error'" variant="subtle" size="sm">
                  {{ user.status ? t('admin.users.active') : t('admin.users.blockedBadge') }}
                </UBadge>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
              <dt class="text-muted">{{ t('admin.users.detail.role') }}</dt>
              <dd>
                <UBadge v-if="isAdmin" color="primary" variant="subtle" size="sm">admin</UBadge>
                <span v-else class="text-muted">{{ t('admin.users.detail.roleUser') }}</span>
              </dd>
            </div>
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
              <dt class="text-muted">{{ t('admin.users.email') }}</dt>
              <dd class="flex items-center gap-1.5">
                <UIcon :name="user.emailVerification ? 'i-ph-seal-check' : 'i-ph-warning-circle'" :class="user.emailVerification ? 'text-success' : 'text-muted'" class="size-4" />
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

        <!-- Account actions -->
        <UPageCard :title="t('admin.users.detail.actions.title')" variant="subtle">
          <div class="text-sm">
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-3">
              <p>{{ user.status ? t('admin.users.detail.actions.block') : t('admin.users.detail.actions.unblock') }}</p>
              <UButton
                v-if="user.status"
                color="error" variant="subtle" icon="i-ph-prohibit" :disabled="isSelf"
                @click="pending = { type: 'block' }"
              >
                {{ t('admin.users.block') }}
              </UButton>
              <UButton v-else color="success" variant="subtle" icon="i-ph-lock-open" @click="pending = { type: 'unblock' }">
                {{ t('admin.users.unblock') }}
              </UButton>
            </div>
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-3">
              <p>{{ t('admin.users.detail.actions.sessions') }}</p>
              <UButton color="neutral" variant="subtle" icon="i-ph-sign-out" @click="pending = { type: 'sessions' }">
                {{ t('admin.users.clearSessions') }}
              </UButton>
            </div>
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-3">
              <p>{{ isAdmin ? t('admin.users.detail.actions.revoke') : t('admin.users.detail.actions.grant') }}</p>
              <UButton
                v-if="!isAdmin"
                color="primary" variant="subtle" icon="i-ph-shield-star"
                @click="pending = { type: 'grant' }"
              >
                {{ t('admin.users.makeAdmin') }}
              </UButton>
              <UButton v-else color="warning" variant="subtle" icon="i-ph-shield-slash" :disabled="isSelf" @click="pending = { type: 'revoke' }">
                {{ t('admin.users.revokeAdmin') }}
              </UButton>
            </div>
            <div class="flex items-center justify-between gap-4 border-b border-default/60 py-3">
              <p>{{ t('admin.users.detail.actions.export') }}</p>
              <UButton color="neutral" variant="subtle" icon="i-ph-download-simple" :loading="exporting" @click="exportData">
                {{ t('admin.users.export') }}
              </UButton>
            </div>
            <div class="flex items-center justify-between gap-4 py-3">
              <p>{{ t('admin.users.detail.actions.delete') }}</p>
              <UButton color="error" variant="subtle" icon="i-ph-trash" :disabled="isSelf" @click="pending = { type: 'delete' }">
                {{ t('admin.users.deleteUser') }}
              </UButton>
            </div>
          </div>
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

        <!-- Comments -->
        <UPageCard variant="subtle">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="font-semibold">{{ t('admin.users.detail.comments') }}</h3>
            <UBadge color="neutral" variant="subtle">{{ t('admin.users.detail.commentsTotal', { count: data?.commentsTotal ?? 0 }) }}</UBadge>
          </div>
          <p v-if="(data?.comments.length ?? 0) === 0" class="text-sm text-muted">{{ t('admin.users.detail.noComments') }}</p>
          <ul v-else class="space-y-3">
            <li v-for="comment in data?.comments" :key="comment.$id" class="border-b border-default/60 pb-3 text-sm last:border-0 last:pb-0">
              <div class="mb-1 flex items-center gap-2">
                <UBadge :color="comment.status === 'active' ? 'success' : comment.status === 'reported' ? 'warning' : 'neutral'" variant="subtle" size="sm">
                  {{ t(`admin.moderation.status.${comment.status}`) }}
                </UBadge>
                <span class="text-xs text-muted">{{ formatRelativeTime(comment.$createdAt) }}</span>
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

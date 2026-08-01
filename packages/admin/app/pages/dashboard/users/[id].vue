<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminUserActivity, AdminUserDetailResponse } from '../../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'users.manage' })

const route = useRoute()
const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const confirm = useConfirm()
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

useHead({ title: () => user.value?.name || t('admin.users.detail.profile') })

type UserAction = 'block' | 'unblock' | 'sessions' | 'delete'
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
    // Rollen sind Appwrite-Labels: eine laufende Sitzung trägt sie erst nach
    // dem nächsten Seitenaufbau — das gehört gesagt, sonst wirkt es kaputt.
    toast.add({
      title: t('admin.users.rolesSaved'),
      description: t('admin.users.rolesSavedDesc'),
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    // `data.reason` (Fehler-Envelope, core shared/types/error.ts). Vorher stand
    // hier `data.data.code` — das kam NIE an: der zentrale Handler verwirft die
    // rohe `data` eines Fehlers, seit 2026-07-29 reist ein geprüfter Grund als
    // `reason` mit. Der last_admin-Hinweis war bis dahin toter Code.
    const lastAdmin = (error as { data?: { reason?: string } })?.data?.reason === 'last_admin'
    toast.add({
      title: lastAdmin ? t('admin.users.lastAdmin') : t('admin.users.actionFailed'),
      description: lastAdmin ? t('admin.users.lastAdminDesc') : t('admin.users.actionFailedDesc'),
      color: 'error',
    })
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

/**
 * Appwrite-Event-Namen in Klartext (Audit-Befund C12).
 *
 * `users.listLogs` liefert rohe API-Ereignisnamen (`account.sessions.create`,
 * `account.update.password`, …). Die standen hier als Monospace-Badge in der
 * Oberfläche — ein Betreiber liest daraus nicht, dass sich jemand angemeldet
 * hat. Die Zuordnung ist eine EXPLIZITE Liste, kein Zerlegen des Punktpfades:
 * ein geratener Text ist schlimmer als der rohe Name.
 *
 * Die Namen sind ein offener Raum (jede Appwrite-Version kann welche
 * hinzufügen) — WAS NICHT IN DER LISTE STEHT, BLEIBT SICHTBAR, roh und
 * monospace. Kein Rückfall auf „Unbekannt", der ein Loch unsichtbar macht.
 */
const ACTIVITY_EVENT_KEYS: Record<string, string> = {
  'account.create': 'accountCreate',
  'account.delete': 'accountDelete',
  'account.update.email': 'emailChanged',
  'account.update.name': 'nameChanged',
  'account.update.password': 'passwordChanged',
  'account.update.phone': 'phoneChanged',
  'account.update.prefs': 'prefsChanged',
  'account.update.status': 'accountDeactivated',
  'account.sessions.create': 'signIn',
  'account.sessions.update': 'sessionRefreshed',
  'account.sessions.delete': 'signOut',
  'account.recovery.create': 'recoveryRequested',
  'account.recovery.update': 'recoveryCompleted',
  'account.verification.create': 'verificationRequested',
  'account.verification.update': 'verificationCompleted',
  'account.tokens.create': 'codeRequested',
  'account.tokens.update': 'codeSignIn',
  'account.targets.create': 'targetAdded',
  'account.targets.update': 'targetChanged',
  'account.targets.delete': 'targetRemoved',
  'users.create': 'createdByOperator',
  'users.delete': 'deletedByOperator',
  'users.update.email': 'emailChangedByOperator',
  'users.update.name': 'nameChangedByOperator',
  'users.update.password': 'passwordChangedByOperator',
  'users.update.labels': 'rolesChangedByOperator',
  'users.update.prefs': 'prefsChangedByOperator',
  'users.update.status': 'statusChangedByOperator',
  'teams.memberships.create': 'membershipCreated',
  'teams.memberships.update': 'membershipChanged',
  'teams.memberships.delete': 'membershipRemoved',
}
function activityEventKey(event: string): string | null {
  const suffix = ACTIVITY_EVENT_KEYS[event]
  if (!suffix) return null
  const key = `admin.users.detail.activity.event.${suffix}`
  return te(key) ? key : null
}

// Aktivitätsprotokoll als Tabelle — dieselben vier kompakten Spalten wie in
// der SessionsTable direkt darüber (B6: eine Karte, zwei Bauweisen war der
// auffälligste Bruch auf dieser Seite).
const activityColumns = computed<TableColumn<AdminUserActivity>[]>(() => [
  { accessorKey: 'event', header: () => t('admin.users.detail.activity.col.event') },
  { id: 'client', header: () => t('admin.users.detail.activity.col.client') },
  { id: 'location', header: () => t('admin.users.detail.activity.col.location') },
  { accessorKey: 'time', header: () => t('admin.users.detail.activity.col.time') },
])

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
    // Stummer Erfolg (Audit-Befund C12): der Download verlässt die Seite, ohne
    // dass hier irgendetwas sichtbar passiert.
    toast.add({
      title: t('admin.users.exportDone'),
      description: t('admin.users.exportDoneDesc'),
      color: 'success',
    })
  }
  catch {
    toast.add({
      title: t('admin.users.exportFailed'),
      description: t('admin.users.exportFailedDesc'),
      color: 'error',
    })
  }
  finally {
    exporting.value = false
  }
}

async function runUserAction(type: UserAction) {
  const target = user.value
  if (!target) return
  try {
    let selfLogout = false
    const ok = await confirm({
      title: t('admin.users.confirmTitle'),
      description: t(`admin.users.confirm.${type}`, { name: target.name }),
      confirmLabel: t('admin.users.confirmAction'),
      color: type === 'block' || type === 'delete' ? 'error' : 'primary',
      action: async () => {
        if (type === 'sessions') {
          const result = await $fetch<{ ok: boolean, self: boolean }>(`/api/admin/users/${target.$id}/sessions`, { method: 'DELETE' })
          selfLogout = result.self
        }
        else if (type === 'delete') {
          // `as string`: das Template-Literal matcht im typed router auch die GET-only
          // Route /api/admin/users/stats — die Method-Union kollabiert sonst
          await $fetch(`/api/admin/users/${target.$id}` as string, { method: 'DELETE' })
        }
        else {
          await $fetch(`/api/admin/users/${target.$id}/status`, { method: 'PATCH', body: { blocked: type === 'block' } })
        }
      },
    })
    if (!ok) return
    if (type === 'sessions') {
      toast.add({
        title: t('admin.users.sessionsCleared'),
        description: t('admin.users.sessionsClearedDesc'),
        color: 'success',
      })
      if (selfLogout) {
        auth.setUser(null)
        await navigateTo(localePath('/'))
        return
      }
    }
    else if (type === 'delete') {
      // Die Seite ist gleich weg — der Toast ist der einzige Ort, an dem der
      // Verbleib des Daten-Snapshots noch auftauchen kann.
      toast.add({
        title: t('admin.users.deleted'),
        description: t('admin.users.deletedDesc'),
        color: 'success',
      })
      await navigateTo(localePath('/dashboard/users'))
      return
    }
    else {
      toast.add({ title: t(type === 'block' ? 'admin.users.blocked' : 'admin.users.unblocked'), color: 'success' })
    }
    await refresh()
  }
  catch (error) {
    // `data.reason` (Fehler-Envelope, core shared/types/error.ts). Vorher stand
    // hier `data.data.code` — das kam NIE an: der zentrale Handler verwirft die
    // rohe `data` eines Fehlers, seit 2026-07-29 reist ein geprüfter Grund als
    // `reason` mit. Der last_admin-Hinweis war bis dahin toter Code.
    const lastAdmin = (error as { data?: { reason?: string } })?.data?.reason === 'last_admin'
    toast.add({
      title: lastAdmin ? t('admin.users.lastAdmin') : t('admin.users.actionFailed'),
      description: lastAdmin ? t('admin.users.lastAdminDesc') : t('admin.users.actionFailedDesc'),
      color: 'error',
    })
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
              <UButton color="neutral" variant="subtle" icon="i-ph-sign-out" @click="runUserAction('sessions')">
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
          <div class="flex min-w-0 flex-col gap-4 sm:gap-6 lg:col-span-2">
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
                <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
                  <dt class="text-muted">{{ t('admin.users.detail.mfa') }}</dt>
                  <dd>
                    <UBadge :color="user.mfa ? 'success' : 'neutral'" variant="subtle" size="sm">
                      <UIcon :name="user.mfa ? 'i-ph-shield-check' : 'i-ph-shield'" class="size-3.5" />
                      {{ user.mfa ? t('admin.users.detail.mfaOn') : t('admin.users.detail.mfaOff') }}
                    </UBadge>
                  </dd>
                </div>
                <div class="flex items-center justify-between gap-4 border-b border-default/60 py-2.5">
                  <dt class="text-muted">{{ t('admin.users.detail.passwordUpdate') }}</dt>
                  <dd v-if="user.passwordUpdate">{{ formatRelativeTime(user.passwordUpdate) }} <span class="text-muted">({{ exactDateTime(user.passwordUpdate) }})</span></dd>
                  <dd v-else class="text-muted">{{ t('admin.users.detail.passwordless') }}</dd>
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
            <!-- min-w-0: der Card-Container ist ein Flex-Item und würde sonst auf
                 Inhaltsbreite der Tabelle wachsen (Layout bricht aus) — so scrollt
                 die Tabelle intern (overflow-auto im UTable-Wrapper) -->
            <UPageCard variant="subtle" :ui="{ container: 'min-w-0' }">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="font-semibold">{{ t('admin.users.detail.sessions') }}</h3>
                <UBadge color="neutral" variant="subtle">{{ data?.sessions.length ?? 0 }}</UBadge>
              </div>
              <p v-if="(data?.sessions.length ?? 0) === 0" class="text-sm text-muted">{{ t('admin.users.detail.noSessions') }}</p>
              <SessionsTable v-else :sessions="data?.sessions ?? []" />
            </UPageCard>

            <!-- Aktivitätsprotokoll (Appwrite users.listLogs — auch beendete Sessions) -->
            <!-- min-w-0 wie bei den Sessions: sonst wächst die Karte auf
                 Inhaltsbreite der Tabelle statt sie scrollen zu lassen -->
            <UPageCard variant="subtle" :ui="{ container: 'min-w-0' }">
              <div class="mb-3 flex items-center justify-between">
                <h3 class="font-semibold">{{ t('admin.users.detail.activity.title') }}</h3>
                <UBadge color="neutral" variant="subtle">{{ data?.activity.length ?? 0 }}</UBadge>
              </div>
              <UTable :data="data?.activity ?? []" :columns="activityColumns" data-user-activity>
                <template #event-cell="{ row }">
                  <span
                    v-if="activityEventKey(row.original.event)"
                    class="text-sm font-medium"
                    :title="row.original.event"
                  >{{ t(activityEventKey(row.original.event)!) }}</span>
                  <UBadge v-else color="neutral" variant="subtle" size="sm" class="font-mono">{{ row.original.event }}</UBadge>
                </template>
                <template #client-cell="{ row }">
                  <div class="flex min-w-0 flex-col gap-1 text-xs text-muted">
                    <span v-if="row.original.clientName" class="flex items-center gap-1.5">
                      <UIcon :name="browserIcon(row.original.clientName)" class="size-3.5 shrink-0" />
                      <span class="truncate">{{ [row.original.clientName, row.original.clientVersion].filter(Boolean).join(' ') }}</span>
                    </span>
                    <span v-if="row.original.osName" class="flex items-center gap-1.5">
                      <UIcon :name="osIcon(row.original.osName)" class="size-3.5 shrink-0" />
                      <span class="truncate">{{ [row.original.osName, row.original.osVersion].filter(Boolean).join(' ') }}</span>
                    </span>
                    <span v-if="row.original.deviceName" class="flex items-center gap-1.5">
                      <UIcon :name="deviceIcon(row.original.deviceName)" class="size-3.5 shrink-0" />
                      <span class="truncate">{{ row.original.deviceName }}</span>
                    </span>
                  </div>
                </template>
                <template #location-cell="{ row }">
                  <div class="flex min-w-0 flex-col gap-1 text-xs">
                    <span class="flex items-center gap-1.5 text-muted">
                      <UIcon :name="flagIcon(row.original.countryCode)" class="size-3.5 shrink-0" />
                      <span class="truncate">{{ row.original.countryName || t('account.sessions.unknown') }}</span>
                    </span>
                    <span class="truncate font-mono text-dimmed">{{ row.original.ip || '—' }}</span>
                  </div>
                </template>
                <template #time-cell="{ row }">
                  <span class="whitespace-nowrap text-xs text-muted" :title="exactDateTime(row.original.time)">
                    {{ formatRelativeTime(row.original.time) }}
                  </span>
                </template>

                <template #empty>
                  <CoreEmptyState
                    icon="i-ph-clock-counter-clockwise"
                    :title="t('admin.users.detail.activity.emptyTitle')"
                    :description="t('admin.users.detail.activity.empty')"
                  />
                </template>
              </UTable>
            </UPageCard>
          </div>

          <!-- Steuerung (sticky) -->
          <div class="flex min-w-0 flex-col gap-4 sm:gap-6 lg:sticky lg:top-6 lg:self-start">
            <!-- Benachrichtigungskanäle (Appwrite users.listTargets) -->
            <UPageCard :title="t('admin.users.detail.targets.title')" variant="subtle">
              <p v-if="(data?.targets.length ?? 0) === 0" class="text-sm text-muted">{{ t('admin.users.detail.targets.empty') }}</p>
              <ul v-else class="space-y-2">
                <li v-for="target in data?.targets" :key="target.$id" class="flex items-center gap-2 text-sm">
                  <UIcon :name="targetIcon(target.providerType)" class="size-4 shrink-0 text-muted" />
                  <span class="min-w-0 truncate font-mono text-xs">{{ target.identifier }}</span>
                  <UBadge color="neutral" variant="subtle" size="sm" class="ms-auto shrink-0">{{ target.providerType }}</UBadge>
                  <UBadge v-if="target.expired" color="warning" variant="subtle" size="sm" class="shrink-0">
                    {{ t('admin.users.detail.targets.expired') }}
                  </UBadge>
                </li>
              </ul>
            </UPageCard>

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
                  @click="runUserAction('block')"
                >
                  {{ t('admin.users.block') }}
                </UButton>
                <UButton v-else block color="success" variant="subtle" icon="i-ph-lock-open" @click="runUserAction('unblock')">
                  {{ t('admin.users.unblock') }}
                </UButton>
                <UButton block color="error" variant="subtle" icon="i-ph-trash" :disabled="isSelf" @click="runUserAction('delete')">
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

    </template>
  </UDashboardPanel>
</template>

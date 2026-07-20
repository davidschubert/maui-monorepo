<script setup lang="ts">
import type { Models } from 'node-appwrite'
import type { NavigationMenuItem } from '@nuxt/ui'
import type { AdminCommentListResponse, ModeratedComment, ModerationAssist, ModerationFilter } from '../../../shared/types/moderation'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'comments.moderate' })

const { t } = useI18n()
const { formatDate } = useFormatDate()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()
const { user: me } = useCurrentUser()

const FILTERS: ModerationFilter[] = ['all', 'reported', 'hidden']
const FILTER_ICON: Record<ModerationFilter, string> = {
  all: 'i-ph-list-bullets',
  reported: 'i-ph-flag',
  hidden: 'i-ph-eye-slash',
}

// Default 'all'; per Query (z.B. Stat-Card-Link ?status=reported) überschreibbar
function filterFromQuery(): ModerationFilter {
  return FILTERS.includes(route.query.status as ModerationFilter)
    ? route.query.status as ModerationFilter
    : 'all'
}
const filter = ref<ModerationFilter>(filterFromQuery())
const { page, setPage } = usePagination()

// Query-Änderungen auf derselben Route (z.B. erneuter Klick auf eine Stat-Card
// mit ?status=reported, während die Seite schon offen ist) übernehmen — die
// ref wird sonst nur beim Setup initialisiert.
watch(() => route.query.status, () => {
  const next = filterFromQuery()
  if (filter.value !== next) {
    filter.value = next
    setPage(1)
  }
})

const { data, refresh } = await useFetch<AdminCommentListResponse>('/api/admin/comments', {
  query: computed(() => ({ status: filter.value, page: page.value })),
})

// Live: bei Kommentar-Events (neu, gemeldet, moderiert) die aktuelle Ansicht
// entprellt nachladen — neue/gemeldete Kommentare poppen ohne Reload auf.
const config = useRuntimeConfig()
let liveTimer: ReturnType<typeof setTimeout> | undefined
function liveRefresh() {
  clearTimeout(liveTimer)
  liveTimer = setTimeout(() => { void refresh() }, 400)
}
// Live: Kommentar-Events (neu, moderiert) UND Report-Events (neue Meldung,
// Rückzug, erledigt) halten die Queue ohne Reload aktuell.
useRealtimeRows<Models.Row>(config.public.appwriteDatabaseId, 'comments', liveRefresh)
useRealtimeRows<Models.Row>(config.public.appwriteDatabaseId, REPORTS_TABLE, liveRefresh)
onScopeDispose(() => clearTimeout(liveTimer))

function setFilter(value: ModerationFilter) {
  filter.value = value
  setPage(1)
}

// ---- Bulk-Moderation (Multi-Select): hide/restore/dismiss für die Auswahl ----
const selected = ref(new Set<string>())
const isSelected = (id: string) => selected.value.has(id)
function toggleSelected(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
const pageIds = computed(() => (data.value?.comments ?? []).filter(c => c.status !== 'deleted').map(c => c.$id))
const allSelected = computed(() => pageIds.value.length > 0 && pageIds.value.every(id => selected.value.has(id)))
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(pageIds.value)
}
// Filter-/Seitenwechsel oder frische Daten → Auswahl auf sichtbare Zeilen eindampfen
watch(data, () => {
  const visible = new Set(pageIds.value)
  selected.value = new Set([...selected.value].filter(id => visible.has(id)))
})

type BulkAction = 'hide' | 'restore' | 'dismiss'
const bulkPending = ref<BulkAction | null>(null)
const bulkBusy = ref(false)

async function executeBulk() {
  if (!bulkPending.value || selected.value.size === 0) return
  bulkBusy.value = true
  try {
    const result = await $fetch<{ ok: boolean, done: string[], failed: string[] }>('/api/admin/comments/bulk', {
      method: 'POST',
      body: { action: bulkPending.value, ids: [...selected.value] },
    })
    toast.add({
      title: result.failed.length
        ? t('admin.moderation.bulk.partial', { done: result.done.length, failed: result.failed.length })
        : t('admin.moderation.bulk.done', { count: result.done.length }),
      color: result.failed.length ? 'warning' : 'success',
    })
    bulkPending.value = null
    selected.value = new Set()
    await refresh()
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    bulkBusy.value = false
  }
}

const filterLinks = computed<NavigationMenuItem[]>(() => FILTERS.map(value => ({
  label: t(`admin.moderation.filter.${value}`),
  icon: FILTER_ICON[value],
  active: filter.value === value,
  onSelect: () => setFilter(value),
})))

type PendingAction =
  | { action: 'hidden' | 'active', comment: ModeratedComment }
  | { action: 'block', comment: ModeratedComment }
  | { action: 'dismiss', comment: ModeratedComment }

const pending = ref<PendingAction | null>(null)
const busy = ref(false)

// Claim-Lock: solange ein Moderator das Bestätigen-Modal für einen Kommentar
// offen hat, beansprucht er ihn (presence action). Andere Moderatoren sehen den
// Badge "X bearbeitet gerade" und vermeiden Doppelarbeit.
const { reviewers, claim, release } = useModerationPresence()
const reviewerFor = (id: string) => reviewers.value.get(`comment:${id}`)
watch(pending, (value) => {
  if (value) claim(`comment:${value.comment.$id}`)
  else release()
})

// KI-Assist (advisory): Einschätzung pro Kommentar einholen und inline zeigen —
// die KI empfiehlt nur, die Aktions-Buttons bleiben die einzige Ausführung.
const assists = ref(new Map<string, ModerationAssist>())
const assistBusy = ref<string | null>(null)
const assistFor = (id: string) => assists.value.get(id)

async function requestAssist(comment: ModeratedComment) {
  assistBusy.value = comment.$id
  try {
    const result = await $fetch<ModerationAssist>(`/api/admin/comments/${comment.$id}/assist`, { method: 'POST' })
    assists.value.set(comment.$id, result)
  }
  catch {
    toast.add({ title: t('admin.moderation.assist.failed'), color: 'error' })
  }
  finally {
    assistBusy.value = null
  }
}

const confirmText = computed(() => {
  if (!pending.value) return ''
  const name = pending.value.comment.authorName
  if (pending.value.action === 'block') return t('admin.users.confirm.block', { name })
  if (pending.value.action === 'dismiss') return t('admin.moderation.confirmDismiss', { name })
  return t(pending.value.action === 'hidden' ? 'admin.moderation.confirmHide' : 'admin.moderation.confirmRestore', { name })
})

async function executePending() {
  if (!pending.value) return
  const { action, comment } = pending.value
  busy.value = true
  try {
    if (action === 'block') {
      await $fetch(`/api/admin/users/${comment.authorId}/status`, { method: 'PATCH', body: { blocked: true } })
      toast.add({ title: t('admin.users.blocked'), color: 'success' })
    }
    else if (action === 'dismiss') {
      // Meldungen verwerfen, Kommentar bleibt sichtbar
      await $fetch('/api/reports/resolve', { method: 'POST', body: { targetType: 'comment', targetId: comment.$id, resolution: 'no_action' } })
      toast.add({ title: t('admin.moderation.dismissed'), color: 'success' })
    }
    else {
      await $fetch(`/api/admin/comments/${comment.$id}/status`, { method: 'PATCH', body: { status: action } })
      // Ausblenden schließt zugleich die offenen Meldungen (Lifecycle)
      if (action === 'hidden') {
        await $fetch('/api/reports/resolve', { method: 'POST', body: { targetType: 'comment', targetId: comment.$id, resolution: 'hidden' } })
      }
      toast.add({ title: t(action === 'hidden' ? 'admin.moderation.hidden' : 'admin.moderation.restored'), color: 'success' })
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
  <UDashboardPanel id="moderation">
    <template #header>
      <UDashboardNavbar :title="`${t('admin.nav.comments')} (${data?.total ?? 0})`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="filterLinks" highlight class="-mx-1 flex-1" data-moderation-filter />
      </UDashboardToolbar>
    </template>

    <template #body>
      <p v-if="(data?.comments?.length ?? 0) === 0" class="text-sm text-muted">
      {{ t('admin.moderation.empty') }}
    </p>

    <div v-else class="mb-3 flex flex-wrap items-center gap-2" data-moderation-bulkbar>
      <UCheckbox
        :model-value="allSelected"
        :label="t('admin.moderation.bulk.selectAll')"
        data-moderation-select-all
        @update:model-value="toggleAll"
      />
      <template v-if="selected.size > 0">
        <UBadge color="neutral" variant="subtle">{{ t('admin.moderation.bulk.count', { count: selected.size }) }}</UBadge>
        <UButton size="xs" color="error" variant="soft" icon="i-ph-eye-slash" data-bulk-hide @click="() => { bulkPending = 'hide' }">
          {{ t('admin.moderation.hide') }}
        </UButton>
        <UButton size="xs" color="primary" variant="soft" icon="i-ph-check" data-bulk-dismiss @click="() => { bulkPending = 'dismiss' }">
          {{ t('admin.moderation.dismiss') }}
        </UButton>
        <UButton size="xs" color="success" variant="soft" icon="i-ph-eye" data-bulk-restore @click="() => { bulkPending = 'restore' }">
          {{ t('admin.moderation.restore') }}
        </UButton>
      </template>
    </div>

    <ul v-if="(data?.comments?.length ?? 0) > 0" class="space-y-3" data-moderation-list>
      <li
        v-for="comment in data?.comments"
        :key="comment.$id"
        class="rounded-lg border border-default p-4"
        :data-moderation-id="comment.$id"
      >
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <UCheckbox
            v-if="comment.status !== 'deleted'"
            :model-value="isSelected(comment.$id)"
            :aria-label="t('admin.moderation.bulk.selectOne')"
            :data-moderation-select="comment.$id"
            @update:model-value="toggleSelected(comment.$id)"
          />
          <ULink :to="localePath(`/dashboard/users/${comment.authorId}`)" class="font-medium text-default hover:text-primary hover:underline">
            {{ comment.authorName }}
          </ULink>
          <span>·</span>
          <span>{{ comment.targetType }}/{{ comment.targetId }}</span>
          <span>·</span>
          <span>{{ formatDate(comment.$createdAt) }}</span>
          <UBadge
            :color="comment.status === 'hidden' ? 'error' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ t(`admin.moderation.status.${comment.status}`) }}
          </UBadge>
          <UBadge
            v-if="comment.reportCount"
            color="warning"
            variant="subtle"
            size="sm"
            icon="i-ph-flag"
            :aria-label="t('admin.moderation.reportsLabel', { count: comment.reportCount })"
          >
            {{ comment.reportCount }}
          </UBadge>
          <UBadge
            v-if="reviewerFor(comment.$id)"
            color="info"
            variant="subtle"
            size="sm"
            icon="i-ph-lock-simple"
          >
            {{ t('admin.moderation.reviewing', { name: reviewerFor(comment.$id) }) }}
          </UBadge>
        </div>

        <p class="mt-2 whitespace-pre-line text-sm">{{ comment.content }}</p>

        <UAlert
          v-if="assistFor(comment.$id)"
          class="mt-3"
          :color="assistFor(comment.$id)!.action === 'hide' ? 'warning' : 'success'"
          variant="subtle"
          icon="i-ph-sparkle"
          :title="t(`admin.moderation.assist.action.${assistFor(comment.$id)!.action}`, { severity: assistFor(comment.$id)!.severity })"
          :description="assistFor(comment.$id)!.assessment"
          data-moderation-assist
        />

        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            v-if="comment.status !== 'hidden' && comment.status !== 'deleted'"
            size="xs" color="error" variant="ghost" icon="i-ph-eye-slash"
            @click="() => { pending = { action: 'hidden', comment } }"
          >
            {{ t('admin.moderation.hide') }}
          </UButton>
          <UButton
            v-if="comment.status !== 'active' && comment.status !== 'deleted'"
            size="xs" color="success" variant="ghost" icon="i-ph-eye"
            @click="() => { pending = { action: 'active', comment } }"
          >
            {{ t('admin.moderation.restore') }}
          </UButton>
          <UButton
            v-if="comment.reportCount"
            size="xs" color="primary" variant="ghost" icon="i-ph-check"
            @click="() => { pending = { action: 'dismiss', comment } }"
          >
            {{ t('admin.moderation.dismiss') }}
          </UButton>
          <UButton
            v-if="comment.reportCount && data?.aiAssist"
            size="xs" color="neutral" variant="ghost" icon="i-ph-sparkle"
            :loading="assistBusy === comment.$id"
            @click="requestAssist(comment)"
          >
            {{ t('admin.moderation.assist.button') }}
          </UButton>
          <UButton
            size="xs" color="error" variant="ghost" icon="i-ph-prohibit"
            :disabled="comment.authorId === me?.$id"
            @click="() => { pending = { action: 'block', comment } }"
          >
            {{ t('admin.moderation.blockAuthor') }}
          </UButton>
          <span v-if="comment.status === 'deleted'" class="text-xs italic text-muted">
            {{ t('admin.moderation.notModeratable') }}
          </span>
        </div>
      </li>
    </ul>

    <UPagination
      v-if="(data?.total ?? 0) > 25"
      :page="page"
      :total="data?.total ?? 0"
      :items-per-page="25"
      @update:page="setPage"
    />

    <UModal :open="bulkPending !== null" :title="t('admin.users.confirmTitle')" @update:open="(value: boolean) => { if (!value) bulkPending = null }">
      <template #body>
        <p class="text-sm">{{ bulkPending ? t(`admin.moderation.bulk.confirm.${bulkPending}`, { count: selected.size }) : '' }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { bulkPending = null }">{{ t('ui.cancel') }}</UButton>
          <UButton :color="bulkPending === 'hide' ? 'error' : 'primary'" :loading="bulkBusy" data-bulk-confirm @click="executeBulk">
            {{ t('admin.users.confirmAction') }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="pending !== null" :title="t('admin.users.confirmTitle')" @update:open="(value: boolean) => { if (!value) pending = null }">
      <template #body>
        <p class="text-sm">{{ confirmText }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { pending = null }">{{ t('ui.cancel') }}</UButton>
          <UButton :color="pending?.action === 'active' || pending?.action === 'dismiss' ? 'primary' : 'error'" :loading="busy" @click="executePending">
            {{ t('admin.users.confirmAction') }}
          </UButton>
        </div>
      </template>
    </UModal>
    </template>
  </UDashboardPanel>
</template>

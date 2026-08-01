<script setup lang="ts">
import type { Models } from 'node-appwrite'
import type { DropdownMenuItem, NavigationMenuItem, TableColumn } from '@nuxt/ui'
import type { AdminCommentListResponse, ModeratedComment, ModerationAssist, ModerationFilter } from '../../../shared/types/moderation'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'comments.moderate' })

const { t, te } = useI18n()
const { formatDate } = useFormatDate()
const toast = useToast()
const confirm = useConfirm()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()
const { user: me } = useCurrentUser()

// --- Nutzer-Verwaltung: eigenes Gate (Audit-Befund S5) -----------------------
// Diese Seite verlangt `comments.moderate` — eine SITE-Capability, die jeder
// Moderator einer Kunden-Site trägt. Zwei Elemente hier greifen aber in die
// NUTZER-Verwaltung, und die ist operator-only (`users.manage`, das KEINE der
// fünf Site-Rollen hält, communityAuthz.ts):
//   - „Autor sperren" PATCHt /api/admin/users/:id/status (requirePermission
//     'users.manage') — für einen Site-Moderator war der Knopf eine Lüge: er
//     sah ihn, klickte, und bekam 403.
//   - der Autorname verlinkte auf /dashboard/users/:id, das dieselbe
//     Capability als requiredCapability führt — der Klick lief ins Leere.
// Zwei Quellen wie in der Nav (N1) und in der Übersicht (S2): Operator-Label
// ODER Site-Rolle. Nur UX-Schicht — die Autorität bleibt der Gate der Route.
const { capabilities: siteCaps } = useCommunityRole()
const canManageUsers = computed(() =>
  userHasCapability(me.value, 'users.manage') || siteCaps.value.has('users.manage'))

/**
 * Inhaltstyp in Klartext (Audit-Befund C12). Die bekannten Typen kommen aus
 * den eigenen Layern (post, page, event, lesson, comment); alles andere kann
 * ein Einbetter frei mitgeben — dafür bleibt der Rohwert stehen.
 */
function targetTypeLabel(targetType: string): string {
  const key = `admin.moderation.targetType.${targetType}`
  return te(key) ? t(key) : targetType
}

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
const { sortField, sortDir, toggle } = useTableSort('$createdAt', 'desc')

/**
 * Deeplink auf EINEN Kommentar (`?comment=<id>`) — das Ziel der
 * Command-Palette (Befund B7). Er folgt demselben Muster wie `?status=`: die
 * URL ist die Quelle, ein watch übernimmt Änderungen an der offenen Seite.
 *
 * Er steht ÜBER Filter, Suche, Sortierung und Seite (die Route liefert dann
 * genau diese eine Zeile) und ist deshalb sichtbar aufhebbar — ein stiller
 * Fokus, der jeden Filterklick verschluckt, wäre die nächste Lüge. Umgekehrt
 * verlässt jeder Filter-/Suchklick den Fokus, damit die Bedienung tut, was sie
 * anzeigt.
 */
const focusId = ref(String(route.query.comment ?? '').trim())
function clearFocus() {
  const { comment: _dropped, ...rest } = route.query
  focusId.value = ''
  void router.replace({ query: rest })
}
watch(() => route.query.comment, (value) => {
  const next = String(value ?? '').trim()
  if (focusId.value === next) return
  focusId.value = next
  setPage(1)
})

// Suche über den Fulltext-Index auf comments.content — erst auf Absenden,
// damit nicht jeder Tastendruck eine Abfrage auslöst.
const search = ref('')
const activeSearch = ref('')
function runSearch() {
  activeSearch.value = search.value.trim()
  if (focusId.value) clearFocus()
  setPage(1)
}

// In der Meldungs-Queue ist die Reihenfolge „neueste Meldung zuerst" —
// eine Datums-/Status-Sortierung wäre dort eine andere Aussage, deshalb
// zeigen wir die Sortierpfeile nur in den übrigen Ansichten.
const sortable = computed(() => filter.value !== 'reported')

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
  query: computed(() => ({
    status: filter.value,
    page: page.value,
    search: activeSearch.value,
    sort: sortField.value,
    dir: sortDir.value,
    // leer ⇒ Parameter entfällt; die Route entscheidet den Fokus, nicht die Seite
    comment: focusId.value || undefined,
  })),
})

// Sortierwechsel → zurück auf Seite 1
watch([sortField, sortDir], () => setPage(1))

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
  // Ein Filterklick verlässt den Deeplink-Fokus — sonst bliebe die Liste bei
  // der einen Zeile und der Klick wirkte kaputt.
  if (focusId.value) clearFocus()
  setPage(1)
}

// „Filter/Suche ohne Treffer" ist ein anderer Leerzustand als „nichts da":
// hier ist der eine nächste Schritt das Zurücksetzen.
const hasActiveFilter = computed(() =>
  filter.value !== 'all' || activeSearch.value !== '' || focusId.value !== '')
function resetFilters() {
  search.value = ''
  activeSearch.value = ''
  setFilter('all')
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

async function runBulk(action: BulkAction) {
  if (selected.value.size === 0) return
  try {
    let result: { done: string[], failed: string[] } | null = null
    const ok = await confirm({
      title: t('admin.users.confirmTitle'),
      description: t(`admin.moderation.bulk.confirm.${action}`, { count: selected.value.size }),
      confirmLabel: t('admin.users.confirmAction'),
      color: action === 'hide' ? 'error' : 'primary',
      action: async () => {
        result = await $fetch<{ ok: boolean, done: string[], failed: string[] }>('/api/admin/comments/bulk', {
          method: 'POST',
          body: { action, ids: [...selected.value] },
        })
      },
    })
    if (!ok || !result) return
    const { done, failed } = result as { done: string[], failed: string[] }
    toast.add({
      title: failed.length
        ? t('admin.moderation.bulk.partial', { done: done.length, failed: failed.length })
        : t('admin.moderation.bulk.done', { count: done.length }),
      // Die Auswahl wird gleich geleert — wo die fehlgeschlagenen Kommentare
      // danach zu finden sind, muss die Meldung sagen.
      description: failed.length ? t('comments.moderation.bulkPartialHint') : undefined,
      color: failed.length ? 'warning' : 'success',
    })
    selected.value = new Set()
    await refresh()
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), description: t('comments.moderation.bulkFailedHint'), color: 'error' })
  }
}

const filterLinks = computed<NavigationMenuItem[]>(() => FILTERS.map(value => ({
  label: t(`admin.moderation.filter.${value}`),
  icon: FILTER_ICON[value],
  active: filter.value === value,
  onSelect: () => setFilter(value),
})))

type PendingAction = 'hidden' | 'active' | 'block' | 'dismiss'

// Claim-Lock: solange ein Moderator den Bestätigungsdialog für einen Kommentar
// offen hat, beansprucht er ihn (presence action). Andere Moderatoren sehen den
// Badge "X bearbeitet gerade" und vermeiden Doppelarbeit.
const { reviewers, claim, release } = useModerationPresence()
const reviewerFor = (id: string) => reviewers.value.get(`comment:${id}`)

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
    toast.add({ title: t('admin.moderation.assist.failed'), description: t('comments.moderation.assistFailedHint'), color: 'error' })
  }
  finally {
    assistBusy.value = null
  }
}

function confirmTextFor(action: PendingAction, name: string): string {
  if (action === 'block') return t('admin.users.confirm.block', { name })
  if (action === 'dismiss') return t('admin.moderation.confirmDismiss', { name })
  return t(action === 'hidden' ? 'admin.moderation.confirmHide' : 'admin.moderation.confirmRestore', { name })
}

async function moderate(action: PendingAction, comment: ModeratedComment) {
  // Der Claim hängt jetzt am offenen Dialog statt an einem `pending`-Ref.
  claim(`comment:${comment.$id}`)
  try {
    const ok = await confirm({
      title: t('admin.users.confirmTitle'),
      description: confirmTextFor(action, comment.authorName),
      confirmLabel: t('admin.users.confirmAction'),
      color: action === 'active' || action === 'dismiss' ? 'primary' : 'error',
      action: async () => {
        if (action === 'block') {
          await $fetch(`/api/admin/users/${comment.authorId}/status`, { method: 'PATCH', body: { blocked: true } })
        }
        else if (action === 'dismiss') {
          // Meldungen verwerfen, Kommentar bleibt sichtbar
          await $fetch('/api/reports/resolve', { method: 'POST', body: { targetType: 'comment', targetId: comment.$id, resolution: 'no_action' } })
        }
        else {
          await $fetch(`/api/admin/comments/${comment.$id}/status`, { method: 'PATCH', body: { status: action } })
          // Ausblenden schließt zugleich die offenen Meldungen (Lifecycle)
          if (action === 'hidden') {
            await $fetch('/api/reports/resolve', { method: 'POST', body: { targetType: 'comment', targetId: comment.$id, resolution: 'hidden' } })
          }
        }
      },
    })
    if (!ok) return
    // Beide Erfolge greifen weiter, als der Titel sagt: Sperren lässt die
    // Kommentare stehen, Ausblenden schließt zugleich die offenen Meldungen.
    if (action === 'block') toast.add({ title: t('admin.users.blocked'), description: t('comments.moderation.blockedHint'), color: 'success' })
    else if (action === 'dismiss') toast.add({ title: t('admin.moderation.dismissed'), color: 'success' })
    else if (action === 'hidden') toast.add({ title: t('admin.moderation.hidden'), description: t('comments.moderation.hiddenHint'), color: 'success' })
    else toast.add({ title: t('admin.moderation.restored'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), description: t('comments.moderation.actionFailedHint'), color: 'error' })
  }
  finally {
    release()
  }
}

// `meta.class` blendet die Nebenspalten auf schmalen Schirmen aus — Autor,
// Kommentar, Status und Aktionen tragen die Entscheidung, Ziel und Datum sind
// Kontext. Die Tabelle selbst scrollt in ihrem eigenen Gefäß (UTable-Root),
// der Seiten-Body nie horizontal.
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<ModeratedComment>[]>(() => [
  { id: 'select', header: () => '' },
  { accessorKey: 'authorName', header: () => t('admin.moderation.col.author') },
  { accessorKey: 'content', header: () => t('admin.moderation.col.comment') },
  { id: 'target', header: () => t('admin.moderation.col.target'), meta: { class: HIDE_LG } },
  { accessorKey: 'status', header: () => t('admin.moderation.col.status') },
  { accessorKey: '$createdAt', header: () => t('admin.moderation.col.date'), id: 'createdAt', meta: { class: HIDE_MD } },
  { id: 'actions', header: () => '' },
])

// Die per Deeplink angesprungene Zeile hervorheben — dieselbe Mechanik wie in
// der Theme-Galerie (UTable meta.class.tr, pro Zeile). Der Fokus zeigt genau
// eine Zeile; die Hervorhebung sagt „das ist der Eintrag aus der Suche".
const tableMeta = computed(() => ({
  class: {
    tr: (row: { original: ModeratedComment }) =>
      row.original.$id === focusId.value ? 'bg-primary/10 ring-1 ring-primary/40' : '',
  },
}))

/**
 * Zeilen-Aktionen im Menü — dieselben Aufrufe wie zuvor als Knopfleiste,
 * inklusive der Gates: „Autor sperren" nur mit `users.manage` (S5), der
 * KI-Assist nur, wenn der Server ihn meldet.
 */
function rowActions(comment: ModeratedComment): DropdownMenuItem[][] {
  if (comment.status === 'deleted') return []
  const items: DropdownMenuItem[] = []
  if (comment.status !== 'hidden') {
    items.push({ label: t('admin.moderation.hide'), icon: 'i-ph-eye-slash', color: 'error', onSelect: () => { void moderate('hidden', comment) } })
  }
  if (comment.status !== 'active') {
    items.push({ label: t('admin.moderation.restore'), icon: 'i-ph-eye', color: 'success', onSelect: () => { void moderate('active', comment) } })
  }
  if (comment.reportCount) {
    items.push({ label: t('admin.moderation.dismiss'), icon: 'i-ph-check', onSelect: () => { void moderate('dismiss', comment) } })
  }
  if (comment.reportCount && data.value?.aiAssist) {
    items.push({ label: t('admin.moderation.assist.button'), icon: 'i-ph-sparkle', onSelect: () => { void requestAssist(comment) } })
  }
  const blockGroup: DropdownMenuItem[] = canManageUsers.value
    ? [{
        label: t('admin.moderation.blockAuthor'),
        icon: 'i-ph-prohibit',
        color: 'error',
        disabled: comment.authorId === me.value?.$id,
        onSelect: () => { void moderate('block', comment) },
      }]
    : []
  return blockGroup.length ? [items, blockGroup] : [items]
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
      <!-- Deeplink-Fokus (Command-Palette): eine Zeile, sichtbar aufhebbar -->
      <UAlert
        v-if="focusId"
        class="mb-4"
        color="primary"
        variant="subtle"
        icon="i-ph-crosshair"
        :title="t('admin.moderation.focus.title')"
        :description="(data?.comments.length ?? 0) > 0 ? t('admin.moderation.focus.description') : t('admin.moderation.focus.missing')"
        :actions="[{ label: t('admin.moderation.focus.clear'), color: 'neutral', variant: 'subtle', onClick: () => clearFocus() }]"
        data-moderation-focus
      />

      <form class="mb-4 flex max-w-md gap-2" @submit.prevent="runSearch">
        <UInput
          v-model="search"
          icon="i-ph-magnifying-glass"
          :placeholder="t('admin.moderation.searchPlaceholder')"
          class="flex-1"
          data-moderation-search
        />
        <UButton type="submit" color="neutral" variant="subtle">{{ t('admin.moderation.search') }}</UButton>
      </form>

      <div v-if="selected.size > 0" class="mb-3 flex flex-wrap items-center gap-2" data-moderation-bulkbar>
        <UBadge color="neutral" variant="subtle">{{ t('admin.moderation.bulk.count', { count: selected.size }) }}</UBadge>
        <UButton size="xs" color="error" variant="soft" icon="i-ph-eye-slash" data-bulk-hide @click="runBulk('hide')">
          {{ t('admin.moderation.hide') }}
        </UButton>
        <UButton size="xs" color="primary" variant="soft" icon="i-ph-check" data-bulk-dismiss @click="runBulk('dismiss')">
          {{ t('admin.moderation.dismiss') }}
        </UButton>
        <UButton size="xs" color="success" variant="soft" icon="i-ph-eye" data-bulk-restore @click="runBulk('restore')">
          {{ t('admin.moderation.restore') }}
        </UButton>
      </div>

      <UTable :data="data?.comments ?? []" :columns="columns" :meta="tableMeta" data-moderation-list>
        <template #select-header>
          <UCheckbox
            :model-value="allSelected"
            :aria-label="t('admin.moderation.bulk.selectAll')"
            data-moderation-select-all
            @update:model-value="toggleAll"
          />
        </template>
        <template #select-cell="{ row }">
          <UCheckbox
            v-if="row.original.status !== 'deleted'"
            :model-value="isSelected(row.original.$id)"
            :aria-label="t('admin.moderation.bulk.selectOne')"
            :data-moderation-select="row.original.$id"
            @update:model-value="toggleSelected(row.original.$id)"
          />
        </template>

        <template #status-header>
          <SortableHeader v-if="sortable" :label="t('admin.moderation.col.status')" field="status" :active="sortField" :dir="sortDir" @toggle="toggle" />
          <span v-else>{{ t('admin.moderation.col.status') }}</span>
        </template>
        <template #createdAt-header>
          <SortableHeader v-if="sortable" :label="t('admin.moderation.col.date')" field="$createdAt" :active="sortField" :dir="sortDir" @toggle="toggle" />
          <span v-else>{{ t('admin.moderation.col.date') }}</span>
        </template>

        <template #authorName-cell="{ row }">
          <!-- S5: Link nur, wenn die Nutzer-Detailseite auch erreichbar ist —
               sonst der reine Name statt eines Links in ein 403. -->
          <ULink
            v-if="canManageUsers"
            :to="localePath(`/dashboard/users/${row.original.authorId}`)"
            class="font-medium text-default hover:text-primary hover:underline"
          >
            {{ row.original.authorName }}
          </ULink>
          <span v-else class="font-medium text-default">{{ row.original.authorName }}</span>
        </template>

        <template #content-cell="{ row }">
          <div class="max-w-md min-w-0" :data-moderation-id="row.original.$id">
            <p class="line-clamp-3 whitespace-pre-line text-sm" :title="row.original.content">{{ row.original.content }}</p>
            <UAlert
              v-if="assistFor(row.original.$id)"
              class="mt-2"
              :color="assistFor(row.original.$id)!.action === 'hide' ? 'warning' : 'success'"
              variant="subtle"
              icon="i-ph-sparkle"
              :title="t(`admin.moderation.assist.action.${assistFor(row.original.$id)!.action}`, { severity: assistFor(row.original.$id)!.severity })"
              :description="assistFor(row.original.$id)!.assessment"
              data-moderation-assist
            />
          </div>
        </template>

        <!--
          „Ziel" war eine rohe `targetType/targetId`-Zeile (Audit-Befund C12,
          interne Ids im Kundenblick). Der TYP ist jetzt Klartext, die ID bleibt
          darunter — sie ist der einzige Weg, den Ort eines Kommentars
          nachzuschlagen, gehört aber nach hinten und nicht in die erste Zeile.

          Bewusst mit Rückfall auf den Rohwert: `targetType` ist ein OFFENER
          Raum (die Einbettung erlaubt beliebige Typen, s. embed.vue), ein
          erfundener Text für einen unbekannten Typ wäre schlimmer als der
          echte Schlüssel.
        -->
        <template #target-cell="{ row }">
          <div class="flex min-w-0 flex-col">
            <span class="truncate text-sm">{{ targetTypeLabel(row.original.targetType) }}</span>
            <span class="truncate font-mono text-xs text-dimmed" :title="row.original.targetId">{{ row.original.targetId }}</span>
          </div>
        </template>

        <template #status-cell="{ row }">
          <div class="flex flex-wrap items-center gap-1">
            <UBadge :color="row.original.status === 'hidden' ? 'error' : 'neutral'" variant="subtle" size="sm">
              {{ t(`admin.moderation.status.${row.original.status}`) }}
            </UBadge>
            <UBadge
              v-if="row.original.reportCount"
              color="warning"
              variant="subtle"
              size="sm"
              icon="i-ph-flag"
              :aria-label="t('admin.moderation.reportsLabel', { count: row.original.reportCount })"
            >
              {{ row.original.reportCount }}
            </UBadge>
            <UBadge v-if="reviewerFor(row.original.$id)" color="info" variant="subtle" size="sm" icon="i-ph-lock-simple">
              {{ t('admin.moderation.reviewing', { name: reviewerFor(row.original.$id) }) }}
            </UBadge>
          </div>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="whitespace-nowrap text-sm text-muted">{{ formatDate(row.original.$createdAt) }}</span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <span v-if="row.original.status === 'deleted'" class="text-xs italic whitespace-nowrap text-muted">
              {{ t('admin.moderation.notModeratable') }}
            </span>
            <UDropdownMenu v-else :items="rowActions(row.original)" :content="{ align: 'end' }">
              <UButton
                icon="i-ph-dots-three-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                :aria-label="t('admin.moderation.rowActions')"
                :loading="assistBusy === row.original.$id"
              />
            </UDropdownMenu>
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            v-if="hasActiveFilter"
            icon="i-ph-funnel"
            :title="t('ui.empty.noResultsTitle')"
            :description="t('ui.empty.noResultsText')"
            :action-label="t('ui.empty.resetFilters')"
            action-icon="i-ph-arrow-counter-clockwise"
            @action="resetFilters"
          />
          <CoreEmptyState
            v-else
            icon="i-ph-chats-circle"
            :title="t('admin.moderation.emptyTitle')"
            :description="t('admin.moderation.empty')"
          />
        </template>
      </UTable>

      <UPagination
        v-if="(data?.total ?? 0) > 25"
        class="mt-4"
        :page="page"
        :total="data?.total ?? 0"
        :items-per-page="25"
        @update:page="setPage"
      />
    </template>
  </UDashboardPanel>
</template>

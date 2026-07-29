<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { createEventSchema } from '../../../schemas/event'
import type { EventRow } from '../../../shared/types/event'
import { effectiveLocationType, isSeriesEvent, isSeriesMaster } from '../../../shared/types/event'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'events.manage' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { formatDateTime } = useEventDateFormat()

useHead({ title: () => t('events.admin.title') })

const { data, status, refresh } = await useFetch<{ rows: EventRow[] }>('/api/events/manage', {
  lazy: true,
  server: false,
})

// Ortstyp-Filter im Toolbar-Muster der Kommentar-Moderation
type LocationFilter = 'all' | 'online' | 'venue'
const LOCATION_FILTERS: LocationFilter[] = ['all', 'online', 'venue']
const LOCATION_ICON: Record<LocationFilter, string> = {
  all: 'i-ph-list-bullets',
  online: 'i-ph-broadcast',
  venue: 'i-ph-map-pin',
}
const locationFilter = ref<LocationFilter>('all')
const filterLinks = computed(() => LOCATION_FILTERS.map(value => ({
  label: t(`events.admin.filter.${value}`),
  icon: LOCATION_ICON[value],
  active: locationFilter.value === value,
  onSelect: () => { locationFilter.value = value },
})))
const filteredRows = computed(() => (data.value?.rows ?? []).filter(row =>
  locationFilter.value === 'all' || effectiveLocationType(row) === locationFilter.value))

// ---- Formular (Anlegen + Bearbeiten teilen sich Modal & State) ----

interface EventForm {
  title: string
  description: string
  startAt: string
  endAt: string
  location: string
  url: string
  capacity: number | null
  locationType: 'venue' | 'online'
  replayUrl: string
  address: string
  locationNotes: string
  access: 'free' | 'paid'
  /** Anzeige-Preis in EUR (Formular) — gespeichert werden Cent */
  priceEur: number | null
  priceLookupKey: string
  /** Serie (§7e) — nur beim Anlegen wählbar; '' = Einzeltermin */
  recurrence: '' | 'weekly' | 'biweekly' | 'monthly'
  /** optionales Serienende (date-Input) */
  seriesUntil: string
}

const emptyForm = (): EventForm => ({
  title: '', description: '', startAt: '', endAt: '', location: '', url: '', capacity: null,
  locationType: 'venue', replayUrl: '', address: '', locationNotes: '',
  access: 'free', priceEur: null, priceLookupKey: '',
  recurrence: '', seriesUntil: '',
})

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const editingCoverFileId = ref<string | null>(null)
const form = reactive<EventForm>(emptyForm())
const saving = ref(false)

// ---- Cover (nur im Bearbeiten-Modus — der Upload braucht die Event-Id) ----

const { coverUrl } = useEventCover()
const coverBusy = ref(false)

async function uploadCover(input: HTMLInputElement) {
  const file = input.files?.[0]
  if (!file || !editingId.value) return
  coverBusy.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const res = await $fetch<{ fileId: string }>(`/api/events/${editingId.value}/cover`, { method: 'POST', body })
    editingCoverFileId.value = res.fileId
    toast.add({ title: t('events.admin.coverSaved'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.coverFailed'), color: 'error' })
  }
  finally {
    coverBusy.value = false
    input.value = ''
  }
}

async function removeCover() {
  if (!editingId.value) return
  coverBusy.value = true
  try {
    await $fetch(`/api/events/${editingId.value}/cover`, { method: 'DELETE' })
    editingCoverFileId.value = null
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.coverFailed'), color: 'error' })
  }
  finally {
    coverBusy.value = false
  }
}

/** ISO → Wert fürs datetime-local-Input (lokale Zeit, Minuten-Präzision) */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** datetime-local → ISO (UTC) — leer bleibt leer */
function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null
}

function openCreate() {
  editingId.value = null
  editingCoverFileId.value = null
  Object.assign(form, emptyForm())
  modalOpen.value = true
}

function openEdit(row: EventRow) {
  editingId.value = row.$id
  Object.assign(form, {
    title: row.title,
    description: row.description,
    startAt: toLocalInput(row.startAt),
    endAt: toLocalInput(row.endAt),
    location: row.location ?? '',
    url: row.url ?? '',
    capacity: row.capacity,
    locationType: effectiveLocationType(row),
    replayUrl: row.replayUrl ?? '',
    address: row.address ?? '',
    locationNotes: row.locationNotes ?? '',
    access: row.access ?? 'free',
    priceEur: row.priceAmount !== null ? row.priceAmount / 100 : null,
    priceLookupKey: row.priceLookupKey ?? '',
  })
  editingCoverFileId.value = row.coverFileId
  modalOpen.value = true
}

async function save() {
  const payload = {
    title: form.title,
    description: form.description,
    startAt: toIso(form.startAt) ?? '',
    endAt: toIso(form.endAt),
    location: form.location.trim() || null,
    url: form.url.trim() || null,
    capacity: form.capacity,
    locationType: form.locationType,
    replayUrl: form.replayUrl.trim() || null,
    address: form.address.trim() || null,
    locationNotes: form.locationNotes.trim() || null,
    access: form.access,
    priceAmount: form.access === 'paid' && form.priceEur !== null ? Math.round(form.priceEur * 100) : null,
    priceLookupKey: form.access === 'paid' ? (form.priceLookupKey.trim() || null) : null,
    // Serie nur beim ANLEGEN — danach gibt es „Serie beenden" (PATCH strippt die Felder eh)
    ...(editingId.value ? {} : {
      recurrence: form.recurrence,
      seriesUntil: form.recurrence && form.seriesUntil ? new Date(`${form.seriesUntil}T23:59:59`).toISOString() : null,
    }),
  }
  const parsed = createEventSchema(t).safeParse(payload)
  if (!parsed.success) {
    toast.add({ title: parsed.error.issues[0]?.message ?? t('events.admin.saveFailed'), color: 'error' })
    return
  }

  saving.value = true
  try {
    if (editingId.value) {
      // `as string`: das Template-Literal matcht im typed router AUCH
      // /api/events/manage (GET-only) — die Method-Union kollabiert sonst
      await $fetch(`/api/events/${editingId.value}` as string, { method: 'PATCH', body: parsed.data })
    }
    else {
      await $fetch('/api/events', { method: 'POST', body: parsed.data })
    }
    toast.add({ title: t('events.admin.saved'), color: 'success' })
    modalOpen.value = false
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.saveFailed'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// ---- Serie (§7e) ----

const recurrenceItems = computed(() => [
  { label: t('events.admin.form.recurrenceNone'), value: '' },
  { label: t('events.series.weekly'), value: 'weekly' },
  { label: t('events.series.biweekly'), value: 'biweekly' },
  { label: t('events.series.monthly'), value: 'monthly' },
])

async function stopSeries(master: EventRow) {
  try {
    let cancelled = 0
    const ok = await confirm({
      title: t('events.admin.stopSeriesTitle', { title: master.title }),
      description: t('events.admin.stopSeriesText'),
      confirmLabel: t('events.admin.stopSeries'),
      action: async () => {
        const res = await $fetch<{ cancelled: number }>(`/api/events/${master.$id}/series` as string, { method: 'DELETE' })
        cancelled = res.cancelled
      },
    })
    if (!ok) return
    toast.add({ title: t('events.admin.seriesStopped', { count: cancelled }), color: 'success', icon: 'i-ph-repeat' })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), color: 'error' })
  }
}

// ---- Status-Aktionen ----

const busyId = ref('')

async function setStatus(row: EventRow, target: 'published' | 'draft') {
  busyId.value = row.$id
  try {
    await $fetch(`/api/events/${row.$id}` as string, { method: 'PATCH', body: { status: target } })
    toast.add({ title: t(target === 'published' ? 'events.admin.published' : 'events.admin.unpublished'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

async function cancelEvent(row: EventRow) {
  try {
    const ok = await confirm({
      title: t('events.admin.confirmCancelTitle'),
      description: t('events.admin.confirmCancelText', { title: row.title }),
      confirmLabel: t('events.admin.cancel'),
      action: () => $fetch(`/api/events/${row.$id}` as string, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('events.admin.cancelled'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), color: 'error' })
  }
}

const statusColor = (row: EventRow) =>
  row.status === 'published' ? 'success' : row.status === 'cancelled' ? 'error' : 'neutral'

// Ort und Teilnehmerzahl sind Kontext — auf schmalen Schirmen fallen sie weg.
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }
const HIDE_LG = { td: 'hidden lg:table-cell', th: 'hidden lg:table-cell' }

const columns = computed<TableColumn<EventRow>[]>(() => [
  { accessorKey: 'title', header: () => t('events.admin.col.event') },
  { accessorKey: 'startAt', header: () => t('events.admin.col.start'), id: 'start' },
  { accessorKey: 'location', header: () => t('events.admin.col.location'), meta: { class: HIDE_LG } },
  { id: 'attendees', header: () => t('events.admin.col.attendees'), meta: { class: HIDE_MD } },
  { accessorKey: 'status', header: () => t('events.admin.col.status') },
  { id: 'actions', header: () => '' },
])

/**
 * Zeilen-Aktionen — die Bedingungen sind unverändert: „Serie beenden" nur
 * beim Serien-Master mit laufender Regel, Veröffentlichen/Zurückziehen je
 * nach Status, Bearbeiten und Absagen nicht mehr bei abgesagten Terminen.
 */
function rowActions(row: EventRow): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = []
  if (row.status === 'draft') {
    items.push({ label: t('events.admin.publish'), icon: 'i-ph-paper-plane-tilt', color: 'success', onSelect: () => { void setStatus(row, 'published') } })
  }
  if (row.status === 'published') {
    items.push({ label: t('events.admin.unpublish'), icon: 'i-ph-eye-slash', onSelect: () => { void setStatus(row, 'draft') } })
  }
  if (row.status !== 'cancelled') {
    items.push({ label: t('events.admin.edit'), icon: 'i-ph-pencil-simple', onSelect: () => openEdit(row) })
  }
  if (isSeriesMaster(row) && (!row.seriesUntil || new Date(row.seriesUntil) > new Date())) {
    items.push({ label: t('events.admin.stopSeries'), icon: 'i-ph-repeat', onSelect: () => { void stopSeries(row) } })
  }
  const destructive: DropdownMenuItem[] = row.status !== 'cancelled'
    ? [{ label: t('events.admin.cancel'), icon: 'i-ph-calendar-x', color: 'error', onSelect: () => { void cancelEvent(row) } }]
    : []
  return destructive.length ? [items, destructive] : [items]
}
</script>

<template>
  <UDashboardPanel id="events-admin">
    <template #header>
      <UDashboardNavbar :title="t('events.admin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" size="sm" data-testid="event-create" @click="openCreate">
            {{ t('events.admin.create') }}
          </UButton>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="filterLinks" highlight class="-mx-1 flex-1" data-events-filter />
      </UDashboardToolbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <UTable v-else :data="filteredRows" :columns="columns" data-events-table>
          <template #title-cell="{ row }">
            <div class="flex min-w-0 items-center gap-2" :data-admin-event="row.original.$id">
              <span class="truncate font-medium">{{ row.original.title }}</span>
              <!-- Serie: Master trägt die Regel, Instanzen den Serien-Hinweis -->
              <UBadge v-if="isSeriesMaster(row.original)" color="info" variant="subtle" size="sm" icon="i-ph-repeat" :data-series-master="row.original.$id">
                {{ t(`events.series.${row.original.recurrence}`) }}
              </UBadge>
              <UTooltip v-else-if="isSeriesEvent(row.original)" :text="t('events.series.instanceHint')">
                <UIcon name="i-ph-repeat" class="size-4 shrink-0 text-muted" />
              </UTooltip>
            </div>
          </template>
          <template #start-cell="{ row }">
            <span class="whitespace-nowrap text-sm text-muted">{{ formatDateTime(row.original.startAt) }}</span>
          </template>
          <template #location-cell="{ row }">
            <span class="text-sm text-muted">{{ row.original.location || '—' }}</span>
          </template>
          <template #attendees-cell="{ row }">
            <span class="whitespace-nowrap text-sm tabular-nums text-muted">
              {{ t('events.card.attendees', { count: row.original.attendeeCount }) }}<template v-if="row.original.capacity !== null">/{{ row.original.capacity }}</template>
            </span>
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="statusColor(row.original)" variant="subtle" size="sm">
              {{ t(`events.admin.status.${row.original.status}`) }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end">
              <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
                <UButton
                  icon="i-ph-dots-three-vertical"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="t('events.admin.rowActions')"
                  :loading="busyId === row.original.$id"
                  :data-admin-publish="row.original.$id"
                  :data-admin-cancel="row.original.$id"
                />
              </UDropdownMenu>
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              v-if="locationFilter !== 'all'"
              icon="i-ph-funnel"
              :title="t('ui.empty.noResultsTitle')"
              :description="t('ui.empty.noResultsText')"
              :action-label="t('ui.empty.resetFilters')"
              action-icon="i-ph-arrow-counter-clockwise"
              @action="() => { locationFilter = 'all' }"
            />
            <CoreEmptyState
              v-else
              icon="i-ph-calendar-dots"
              :title="t('events.admin.emptyTitle')"
              :description="t('events.admin.empty')"
              :action-label="t('events.admin.create')"
              action-icon="i-ph-plus"
              @action="openCreate"
            />
          </template>
        </UTable>
      </ClientOnly>

      <UModal v-model:open="modalOpen" :title="editingId ? t('events.admin.editTitle') : t('events.admin.createTitle')">
        <template #body>
          <form class="space-y-4" data-testid="event-form" @submit.prevent="save">
            <UFormField :label="t('events.admin.form.title')" required>
              <UInput v-model="form.title" class="w-full" :maxlength="200" data-testid="event-form-title" />
            </UFormField>
            <UFormField :label="t('events.admin.form.description')" :help="t('events.admin.form.descriptionHelp')" required>
              <UTextarea v-model="form.description" class="w-full" :rows="5" data-testid="event-form-description" />
            </UFormField>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField :label="t('events.admin.form.startAt')" required>
                <UInput v-model="form.startAt" type="datetime-local" class="w-full" data-testid="event-form-start" />
              </UFormField>
              <UFormField :label="t('events.admin.form.endAt')">
                <UInput v-model="form.endAt" type="datetime-local" class="w-full" />
              </UFormField>
            </div>
            <!-- Serie (§7e): nur beim Anlegen — danach gibt es „Serie beenden" -->
            <div v-if="!editingId" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField :label="t('events.admin.form.recurrence')" :help="t('events.admin.form.recurrenceHelp')">
                <USelect v-model="form.recurrence" :items="recurrenceItems" class="w-full" data-testid="event-form-recurrence" />
              </UFormField>
              <UFormField v-if="form.recurrence" :label="t('events.admin.form.seriesUntil')" :help="t('events.admin.form.seriesUntilHelp')">
                <UInput v-model="form.seriesUntil" type="date" class="w-full" data-testid="event-form-series-until" />
              </UFormField>
            </div>
            <UFormField :label="t('events.admin.form.locationType')">
              <div class="flex gap-1" data-testid="event-form-location-type">
                <UButton
                  :color="form.locationType === 'venue' ? 'primary' : 'neutral'"
                  :variant="form.locationType === 'venue' ? 'soft' : 'ghost'"
                  size="sm" icon="i-ph-map-pin"
                  @click="() => { form.locationType = 'venue' }"
                >
                  {{ t('events.admin.form.venue') }}
                </UButton>
                <UButton
                  :color="form.locationType === 'online' ? 'primary' : 'neutral'"
                  :variant="form.locationType === 'online' ? 'soft' : 'ghost'"
                  size="sm" icon="i-ph-video-camera"
                  @click="() => { form.locationType = 'online' }"
                >
                  {{ t('events.admin.form.online') }}
                </UButton>
              </div>
            </UFormField>
            <UFormField v-if="form.locationType === 'venue'" :label="t('events.admin.form.location')">
              <UInput v-model="form.location" class="w-full" :maxlength="255" />
            </UFormField>
            <UFormField
              v-if="form.locationType === 'venue'"
              :label="t('events.admin.form.address')"
              :help="t('events.admin.form.addressHelp')"
            >
              <UInput v-model="form.address" class="w-full" :maxlength="255" data-testid="event-form-address" />
            </UFormField>
            <UFormField
              v-if="form.locationType === 'venue'"
              :label="t('events.admin.form.locationNotes')"
              :help="t('events.admin.form.locationNotesHelp')"
            >
              <UTextarea v-model="form.locationNotes" class="w-full" :rows="2" :maxlength="1000" />
            </UFormField>
            <UFormField
              :label="t('events.admin.form.url')"
              :help="form.locationType === 'online' ? t('events.admin.form.urlHelp') : undefined"
            >
              <UInput v-model="form.url" type="url" class="w-full" :maxlength="500" placeholder="https://" />
            </UFormField>
            <UFormField :label="t('events.admin.form.replayUrl')" :help="t('events.admin.form.replayHelp')">
              <UInput v-model="form.replayUrl" type="url" class="w-full" :maxlength="500" placeholder="https://" />
            </UFormField>
            <UFormField :label="t('events.admin.form.capacity')" :help="t('events.admin.form.capacityHelp')">
              <UInputNumber v-model="form.capacity" :min="1" class="w-full" data-testid="event-form-capacity" />
            </UFormField>

            <UFormField :label="t('events.admin.form.access')" :help="t('events.admin.form.accessHelp')">
              <div class="flex gap-1" data-testid="event-form-access">
                <UButton
                  :color="form.access === 'free' ? 'primary' : 'neutral'"
                  :variant="form.access === 'free' ? 'soft' : 'ghost'"
                  size="sm"
                  @click="() => { form.access = 'free' }"
                >
                  {{ t('events.card.free') }}
                </UButton>
                <UButton
                  :color="form.access === 'paid' ? 'primary' : 'neutral'"
                  :variant="form.access === 'paid' ? 'soft' : 'ghost'"
                  size="sm" icon="i-ph-ticket"
                  @click="() => { form.access = 'paid' }"
                >
                  {{ t('events.card.paid') }}
                </UButton>
              </div>
            </UFormField>
            <div v-if="form.access === 'paid'" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField :label="t('events.admin.form.priceEur')">
                <UInputNumber v-model="form.priceEur" :min="0" :step="0.5" class="w-full" data-testid="event-form-price" />
              </UFormField>
              <UFormField :label="t('events.admin.form.priceLookupKey')" :help="t('events.admin.form.priceLookupKeyHelp')" required>
                <UInput v-model="form.priceLookupKey" class="w-full" :maxlength="64" placeholder="event_sommerfest" />
              </UFormField>
            </div>

            <UFormField v-if="editingId" :label="t('events.admin.form.cover')" :help="t('events.admin.form.coverHelp')">
              <div class="flex items-center gap-3" data-testid="event-form-cover">
                <img
                  v-if="editingCoverFileId"
                  :src="coverUrl(editingCoverFileId)"
                  alt=""
                  class="h-12 w-20 rounded object-cover"
                >
                <label class="inline-flex">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    class="hidden"
                    data-testid="event-cover-input"
                    @change="uploadCover($event.target as HTMLInputElement)"
                  >
                  <UButton as="span" color="neutral" variant="outline" size="sm" icon="i-ph-upload-simple" :loading="coverBusy">
                    {{ editingCoverFileId ? t('events.admin.form.coverReplace') : t('events.admin.form.coverUpload') }}
                  </UButton>
                </label>
                <UButton
                  v-if="editingCoverFileId"
                  color="error" variant="ghost" size="sm" icon="i-ph-trash"
                  :disabled="coverBusy"
                  @click="removeCover"
                >
                  {{ t('events.admin.form.coverRemove') }}
                </UButton>
              </div>
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" @click="() => { modalOpen = false }">
                {{ t('events.admin.form.cancel') }}
              </UButton>
              <UButton type="submit" :loading="saving" data-testid="event-form-save">
                {{ t('events.admin.form.save') }}
              </UButton>
            </div>
          </form>
        </template>
      </UModal>

    </template>
  </UDashboardPanel>
</template>

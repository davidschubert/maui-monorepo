<script setup lang="ts">
import { createEventSchema } from '../../../schemas/event'
import type { EventRow } from '../../../shared/types/event'
import { effectiveLocationType, isSeriesEvent, isSeriesMaster } from '../../../shared/types/event'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'events.manage' })

const { t } = useI18n()
const toast = useToast()
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

const confirmStopSeries = ref<EventRow | null>(null)
const stoppingSeries = ref(false)
async function stopSeries() {
  const master = confirmStopSeries.value
  if (!master) return
  stoppingSeries.value = true
  try {
    const res = await $fetch<{ cancelled: number }>(`/api/events/${master.$id}/series` as string, { method: 'DELETE' })
    toast.add({ title: t('events.admin.seriesStopped', { count: res.cancelled }), color: 'success', icon: 'i-ph-repeat' })
    confirmStopSeries.value = null
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), color: 'error' })
  }
  finally {
    stoppingSeries.value = false
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
  busyId.value = row.$id
  try {
    await $fetch(`/api/events/${row.$id}` as string, { method: 'DELETE' })
    toast.add({ title: t('events.admin.cancelled'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('events.admin.actionFailed'), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

const statusColor = (row: EventRow) =>
  row.status === 'published' ? 'success' : row.status === 'cancelled' ? 'error' : 'neutral'
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

        <div v-else>
          <p v-if="!filteredRows.length" class="py-16 text-center text-sm text-muted">
            {{ t('events.admin.empty') }}
          </p>

          <ul v-else class="divide-y divide-default">
            <li v-for="row in filteredRows" :key="row.$id" class="flex items-center gap-3 py-3 text-sm" :data-admin-event="row.$id">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{{ row.title }}</p>
                <p class="text-xs text-muted">
                  {{ formatDateTime(row.startAt) }}
                  <template v-if="row.location"> · {{ row.location }}</template>
                  · {{ t('events.card.attendees', { count: row.attendeeCount }) }}<template v-if="row.capacity !== null">/{{ row.capacity }}</template>
                </p>
              </div>

              <!-- Serie: Master trägt die Regel, Instanzen den Serien-Hinweis -->
              <UBadge v-if="isSeriesMaster(row)" color="info" variant="subtle" size="sm" icon="i-ph-repeat" :data-series-master="row.$id">
                {{ t(`events.series.${row.recurrence}`) }}
              </UBadge>
              <UTooltip v-else-if="isSeriesEvent(row)" :text="t('events.series.instanceHint')">
                <UIcon name="i-ph-repeat" class="size-4 shrink-0 text-muted" />
              </UTooltip>

              <UBadge :color="statusColor(row)" variant="subtle" size="sm">
                {{ t(`events.admin.status.${row.status}`) }}
              </UBadge>

              <UButton
                v-if="isSeriesMaster(row) && (!row.seriesUntil || new Date(row.seriesUntil) > new Date())"
                color="neutral" variant="ghost" size="xs" icon="i-ph-repeat"
                :data-series-stop="row.$id"
                @click="() => { confirmStopSeries = row }"
              >
                {{ t('events.admin.stopSeries') }}
              </UButton>

              <UButton
                v-if="row.status === 'draft'"
                color="success" variant="ghost" size="xs" icon="i-ph-paper-plane-tilt"
                :loading="busyId === row.$id" :data-admin-publish="row.$id"
                @click="setStatus(row, 'published')"
              >
                {{ t('events.admin.publish') }}
              </UButton>
              <UButton
                v-if="row.status === 'published'"
                color="neutral" variant="ghost" size="xs" icon="i-ph-eye-slash"
                :loading="busyId === row.$id"
                @click="setStatus(row, 'draft')"
              >
                {{ t('events.admin.unpublish') }}
              </UButton>
              <UButton
                v-if="row.status !== 'cancelled'"
                color="neutral" variant="ghost" size="xs" icon="i-ph-pencil-simple"
                @click="openEdit(row)"
              >
                {{ t('events.admin.edit') }}
              </UButton>
              <UButton
                v-if="row.status !== 'cancelled'"
                color="error" variant="ghost" size="xs" icon="i-ph-calendar-x"
                :loading="busyId === row.$id" :data-admin-cancel="row.$id"
                @click="cancelEvent(row)"
              >
                {{ t('events.admin.cancel') }}
              </UButton>
            </li>
          </ul>
        </div>
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

      <!-- Serie beenden — künftige Termine werden abgesagt, Vergangenheit bleibt -->
      <UModal
        :open="confirmStopSeries !== null"
        :title="t('events.admin.stopSeriesTitle', { title: confirmStopSeries?.title ?? '' })"
        @update:open="(value: boolean) => { if (!value) confirmStopSeries = null }"
      >
        <template #body>
          <p class="text-sm">{{ t('events.admin.stopSeriesText') }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="() => { confirmStopSeries = null }">{{ t('events.admin.form.cancel') }}</UButton>
            <UButton color="error" :loading="stoppingSeries" data-testid="series-stop-confirm" @click="stopSeries">
              {{ t('events.admin.stopSeries') }}
            </UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

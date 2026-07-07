<script setup lang="ts">
import { createEventSchema } from '../../../schemas/event'
import type { EventRow } from '../../../shared/types/event'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'events.manage' })

const { t } = useI18n()
const toast = useToast()
const { formatDateTime } = useEventDateFormat()

useHead({ title: () => t('events.admin.title') })

const { data, status, refresh } = await useFetch<{ rows: EventRow[] }>('/api/events/manage', {
  lazy: true,
  server: false,
})

// ---- Formular (Anlegen + Bearbeiten teilen sich Modal & State) ----

interface EventForm {
  title: string
  description: string
  startAt: string
  endAt: string
  location: string
  url: string
  capacity: number | null
}

const emptyForm = (): EventForm => ({
  title: '', description: '', startAt: '', endAt: '', location: '', url: '', capacity: null,
})

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive<EventForm>(emptyForm())
const saving = ref(false)

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
  })
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
          <p v-if="!data?.rows.length" class="py-16 text-center text-sm text-muted">
            {{ t('events.admin.empty') }}
          </p>

          <ul v-else class="divide-y divide-default">
            <li v-for="row in data.rows" :key="row.$id" class="flex items-center gap-3 py-3 text-sm" :data-admin-event="row.$id">
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium">{{ row.title }}</p>
                <p class="text-xs text-muted">
                  {{ formatDateTime(row.startAt) }}
                  <template v-if="row.location"> · {{ row.location }}</template>
                  · {{ t('events.card.attendees', { count: row.attendeeCount }) }}<template v-if="row.capacity !== null">/{{ row.capacity }}</template>
                </p>
              </div>

              <UBadge :color="statusColor(row)" variant="subtle" size="sm">
                {{ t(`events.admin.status.${row.status}`) }}
              </UBadge>

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
            <UFormField :label="t('events.admin.form.description')" required>
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
            <UFormField :label="t('events.admin.form.location')">
              <UInput v-model="form.location" class="w-full" :maxlength="255" />
            </UFormField>
            <UFormField :label="t('events.admin.form.url')">
              <UInput v-model="form.url" type="url" class="w-full" :maxlength="500" placeholder="https://" />
            </UFormField>
            <UFormField :label="t('events.admin.form.capacity')" :help="t('events.admin.form.capacityHelp')">
              <UInputNumber v-model="form.capacity" :min="1" class="w-full" data-testid="event-form-capacity" />
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton color="neutral" variant="ghost" @click="modalOpen = false">
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

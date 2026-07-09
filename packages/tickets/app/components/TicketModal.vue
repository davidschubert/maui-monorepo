<script setup lang="ts">
import type { TicketAssignableResponse, TicketChecklistItem, TicketListRow, TicketMember, TicketRow } from '../../shared/types/ticket'
import { TICKET_EFFORTS, TICKET_LABELS, TICKET_PRIORITIES } from '../../shared/types/ticket'
import { composeTicketMarkdown, parseTicketChecklist, parseTicketMembers } from '../utils/ticketMarkdown'

/**
 * Karten-Detail (Trello-Muster): alle Felder editierbar, Beschreibung als
 * Markdown (Vorschau via Core-Sink), Checkliste, Mitglieder (Admins/Mods),
 * Aktionen inkl. „Für Claude Code kopieren" / .md-Download (Plan §5).
 * Bleibt GEMOUNTET — v-model:open steuert UModal (Unmount-während-offen
 * hinterlässt sonst verwaistes Teleport-DOM).
 */
const props = defineProps<{
  ticket: TicketRow | null
  lists: TicketListRow[]
}>()
const emit = defineEmits<{ refresh: [] }>()
const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const { user } = useCurrentUser()

const form = reactive({
  title: '',
  listId: '',
  label: '' as string,
  priority: '' as string,
  effort: '' as string,
  startAt: '',
  dueAt: '',
  description: '',
})
const checklist = ref<TicketChecklistItem[]>([])
const members = ref<TicketMember[]>([])
const editingDescription = ref(false)
const newChecklistItem = ref('')
const busy = ref(false)
const confirmDelete = ref(false)

/** ISO ↔ datetime-local (30-min-Raster über step im Input) */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function toIso(local: string): string | null {
  return local ? new Date(local).toISOString() : null
}

// Reka-Select verbietet ''-Werte für Items — Sentinel 'none' ↔ DB ''
const NONE = 'none'
const fromDb = (value: string) => value || NONE
const toDb = (value: string) => (value === NONE ? '' : value)

// Formular bei jedem neuen Ticket frisch befüllen
watch(() => props.ticket?.$id, () => {
  const ticket = props.ticket
  if (!ticket) return
  form.title = ticket.title
  form.listId = ticket.listId
  form.label = fromDb(ticket.label)
  form.priority = fromDb(ticket.priority)
  form.effort = fromDb(ticket.effort)
  form.startAt = toLocalInput(ticket.startAt)
  form.dueAt = toLocalInput(ticket.dueAt)
  form.description = ticket.description
  checklist.value = parseTicketChecklist(ticket.checklist)
  members.value = parseTicketMembers(ticket.membersJson)
  editingDescription.value = !ticket.description
  newChecklistItem.value = ''
  confirmDelete.value = false
}, { immediate: true })

const { data: assignable } = useFetch<TicketAssignableResponse>('/api/tickets/assignable', {
  key: 'tickets:assignable',
  lazy: true,
  server: false,
  default: () => ({ users: [] }),
})

const listItems = computed(() => props.lists.map(list => ({ label: list.title, value: list.$id })))
const noneItem = computed(() => ({ label: t('tickets.modal.none'), value: NONE }))
const labelItems = computed(() => [noneItem.value, ...TICKET_LABELS.map(v => ({ label: t(`tickets.labels.${v}`), value: v }))])
const priorityItems = computed(() => [noneItem.value, ...TICKET_PRIORITIES.map(v => ({ label: t(`tickets.priorities.${v}`), value: v }))])
const effortItems = computed(() => [noneItem.value, ...TICKET_EFFORTS.map(v => ({ label: t(`tickets.efforts.${v}`), value: v }))])
const memberItems = computed(() => (assignable.value?.users ?? []).map(u => ({ label: u.name, value: u.id })))
const memberIds = computed({
  get: () => members.value.map(m => m.id),
  set: (ids: string[]) => {
    const pool = new Map((assignable.value?.users ?? []).map(u => [u.id, u]))
    members.value = ids.flatMap((id) => {
      const known = pool.get(id) ?? members.value.find(m => m.id === id)
      return known ? [known] : []
    })
  },
})
const isMember = computed(() => members.value.some(m => m.id === user.value?.$id))
function joinCard() {
  if (!user.value || isMember.value) return
  members.value = [...members.value, { id: user.value.$id, name: user.value.name ?? '' }]
}

function addChecklistItem() {
  const text = newChecklistItem.value.trim()
  if (!text) return
  checklist.value.push({ text, done: false })
  newChecklistItem.value = ''
}

async function patch(body: Record<string, unknown>) {
  if (!props.ticket) return false
  busy.value = true
  try {
    await $fetch(`/api/tickets/${props.ticket.$id}`, { method: 'PATCH', body })
    emit('refresh')
    return true
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
    return false
  }
  finally {
    busy.value = false
  }
}

async function save() {
  if (!props.ticket) return
  const ok = await patch({
    title: form.title.trim() || props.ticket.title,
    listId: form.listId,
    label: toDb(form.label),
    priority: toDb(form.priority),
    effort: toDb(form.effort),
    startAt: toIso(form.startAt),
    dueAt: toIso(form.dueAt),
    description: form.description,
    checklist: checklist.value,
    members: members.value,
  })
  if (ok) {
    toast.add({ title: t('tickets.modal.saved'), color: 'success' })
    open.value = false
  }
}

async function toggleDone() {
  if (!props.ticket) return
  await patch({ status: props.ticket.status === 'done' ? 'open' : 'done' })
  open.value = false
}

async function duplicate() {
  if (!props.ticket) return
  busy.value = true
  try {
    await $fetch(`/api/tickets/${props.ticket.$id}/duplicate`, { method: 'POST' })
    toast.add({ title: t('tickets.modal.duplicated'), color: 'success' })
    emit('refresh')
    open.value = false
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function remove() {
  if (!props.ticket) return
  busy.value = true
  try {
    await $fetch(`/api/tickets/${props.ticket.$id}`, { method: 'DELETE' })
    toast.add({ title: t('tickets.modal.deleted'), color: 'success' })
    emit('refresh')
    open.value = false
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}

// Markdown-Export (Clipboard + Download) — aus dem AKTUELLEN Formular-Stand
function exportMarkdown(): string {
  if (!props.ticket) return ''
  const listTitle = props.lists.find(list => list.$id === form.listId)?.title ?? ''
  const snapshot: TicketRow = {
    ...props.ticket,
    title: form.title,
    description: form.description,
    label: toDb(form.label) as TicketRow['label'],
    priority: toDb(form.priority) as TicketRow['priority'],
    effort: toDb(form.effort) as TicketRow['effort'],
    dueAt: toIso(form.dueAt),
    checklist: checklist.value.length ? JSON.stringify(checklist.value) : '',
  }
  return composeTicketMarkdown({
    ticket: snapshot,
    listTitle,
    url: `${window.location.origin}${window.location.pathname}?ticket=${props.ticket.$id}`,
    labels: {
      label: t('tickets.modal.label'), priority: t('tickets.modal.priority'),
      effort: t('tickets.modal.effort'), list: t('tickets.modal.list'),
      due: t('tickets.modal.dueAt'), task: t('tickets.export.task'),
      checklist: t('tickets.modal.checklist'), context: t('tickets.export.context'),
    },
  })
}
async function copyMarkdown() {
  await navigator.clipboard.writeText(exportMarkdown())
  toast.add({ title: t('tickets.export.copied'), color: 'success', icon: 'i-ph-clipboard-text' })
}
function downloadMarkdown() {
  if (!props.ticket) return
  const blob = new Blob([exportMarkdown()], { type: 'text/markdown' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `ticket-${props.ticket.$id}.md`
  link.click()
  URL.revokeObjectURL(link.href)
}

async function shareLink() {
  if (!props.ticket) return
  await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?ticket=${props.ticket.$id}`)
  toast.add({ title: t('tickets.modal.linkCopied'), color: 'success', icon: 'i-ph-link' })
}
</script>

<template>
  <!-- #body statt #content — bewährtes Muster (comments.vue); kein title/close-Prop,
       damit UModal keinen doppelten Header rendert (eigene Kopfzeile unten) -->
  <UModal v-model:open="open" :close="false" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <div v-if="ticket" class="max-h-[80vh] overflow-y-auto" data-testid="ticket-modal">
        <div class="flex items-start gap-3">
          <UButton
            :icon="ticket.status === 'done' ? 'i-ph-check-circle-fill' : 'i-ph-circle'"
            :color="ticket.status === 'done' ? 'success' : 'neutral'"
            variant="ghost"
            size="lg"
            :aria-label="t('tickets.modal.toggleDone')"
            :loading="busy"
            data-testid="ticket-done-toggle"
            @click="toggleDone"
          />
          <UInput v-model="form.title" size="xl" variant="ghost" class="flex-1 font-semibold" />
          <UButton icon="i-ph-x" color="neutral" variant="ghost" :aria-label="t('tickets.modal.close')" @click="open = false" />
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <UFormField :label="t('tickets.modal.list')">
            <USelect v-model="form.listId" :items="listItems" size="sm" class="w-full" />
          </UFormField>
          <UFormField :label="t('tickets.modal.label')">
            <USelect v-model="form.label" :items="labelItems" size="sm" class="w-full" />
          </UFormField>
          <UFormField :label="t('tickets.modal.priority')">
            <USelect v-model="form.priority" :items="priorityItems" size="sm" class="w-full" />
          </UFormField>
          <UFormField :label="t('tickets.modal.effort')">
            <USelect v-model="form.effort" :items="effortItems" size="sm" class="w-full" />
          </UFormField>
          <UFormField :label="t('tickets.modal.startAt')">
            <UInput v-model="form.startAt" type="datetime-local" step="1800" size="sm" class="w-full" />
          </UFormField>
          <UFormField :label="t('tickets.modal.dueAt')">
            <UInput v-model="form.dueAt" type="datetime-local" step="1800" size="sm" class="w-full" />
          </UFormField>
        </div>

        <UFormField :label="t('tickets.modal.members')" class="mt-4">
          <div class="flex items-center gap-2">
            <USelectMenu
              v-model="memberIds"
              :items="memberItems"
              value-key="value"
              multiple
              size="sm"
              class="flex-1"
              :placeholder="t('tickets.modal.membersPlaceholder')"
            />
            <UButton v-if="!isMember" icon="i-ph-hand-waving" color="neutral" variant="subtle" size="sm" @click="joinCard">
              {{ t('tickets.modal.join') }}
            </UButton>
          </div>
        </UFormField>

        <div class="mt-5">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">{{ t('tickets.modal.description') }}</h3>
            <UButton
              :icon="editingDescription ? 'i-ph-eye' : 'i-ph-pencil-simple'"
              color="neutral" variant="ghost" size="xs"
              @click="editingDescription = !editingDescription"
            >
              {{ editingDescription ? t('tickets.modal.preview') : t('tickets.modal.edit') }}
            </UButton>
          </div>
          <UTextarea
            v-if="editingDescription"
            v-model="form.description"
            :rows="8"
            autoresize
            class="mt-2 w-full font-mono text-sm"
            :placeholder="t('tickets.modal.descriptionPlaceholder')"
          />
          <ContentClamp v-else-if="form.description" :lines="12" class="mt-2">
            <MarkdownContent :source="form.description" />
          </ContentClamp>
          <p v-else class="mt-2 text-sm text-muted">{{ t('tickets.modal.noDescription') }}</p>
        </div>

        <div class="mt-5">
          <h3 class="text-sm font-semibold">
            {{ t('tickets.modal.checklist') }}
            <span v-if="checklist.length" class="ms-1 text-xs font-normal text-muted">
              {{ checklist.filter(i => i.done).length }}/{{ checklist.length }}
            </span>
          </h3>
          <ul class="mt-2 space-y-1.5">
            <li v-for="(item, itemIndex) in checklist" :key="itemIndex" class="flex items-center gap-2">
              <UCheckbox v-model="item.done" />
              <span class="flex-1 text-sm" :class="item.done ? 'text-muted line-through' : ''">{{ item.text }}</span>
              <UButton icon="i-ph-x" color="neutral" variant="ghost" size="xs" :aria-label="t('tickets.modal.removeItem')" @click="checklist.splice(itemIndex, 1)" />
            </li>
          </ul>
          <form class="mt-2 flex gap-2" @submit.prevent="addChecklistItem">
            <UInput v-model="newChecklistItem" size="sm" class="flex-1" :placeholder="t('tickets.modal.checklistPlaceholder')" />
            <UButton type="submit" icon="i-ph-plus" color="neutral" variant="subtle" size="sm" :aria-label="t('tickets.modal.addItem')" />
          </form>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-2 border-t border-default pt-4">
          <UButton icon="i-ph-clipboard-text" color="neutral" variant="subtle" size="sm" data-testid="copy-md" @click="copyMarkdown">
            {{ t('tickets.export.copy') }}
          </UButton>
          <UButton icon="i-ph-download-simple" color="neutral" variant="subtle" size="sm" @click="downloadMarkdown">
            {{ t('tickets.export.download') }}
          </UButton>
          <UButton icon="i-ph-link" color="neutral" variant="ghost" size="sm" :aria-label="t('tickets.modal.share')" @click="shareLink" />
          <UButton icon="i-ph-copy" color="neutral" variant="ghost" size="sm" @click="duplicate">
            {{ t('tickets.modal.duplicate') }}
          </UButton>
          <UButton
            v-if="!confirmDelete"
            icon="i-ph-trash" color="error" variant="ghost" size="sm"
            @click="confirmDelete = true"
          >
            {{ t('tickets.modal.delete') }}
          </UButton>
          <UButton v-else icon="i-ph-warning" color="error" variant="solid" size="sm" :loading="busy" @click="remove">
            {{ t('tickets.modal.deleteConfirm') }}
          </UButton>
          <UButton class="ms-auto" color="primary" size="sm" :loading="busy" data-testid="ticket-save" @click="save">
            {{ t('tickets.modal.save') }}
          </UButton>
        </div>

        <p class="mt-3 text-xs text-muted">
          {{ t('tickets.modal.createdBy', { name: ticket.createdByName || '—', date: new Date(ticket.$createdAt).toLocaleString() }) }}
        </p>
      </div>
    </template>
  </UModal>
</template>

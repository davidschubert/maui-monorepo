<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import type { TicketChecklistItem, TicketListRow, TicketMember, TicketRow } from '../../shared/types/ticket'
import { TICKET_EFFORTS, TICKET_LABELS, TICKET_PRIORITIES } from '../../shared/types/ticket'
import { composeTicketMarkdown, parseTicketChecklist, parseTicketMembers } from '../utils/ticketMarkdown'
import { TICKET_EFFORT_META, TICKET_LABEL_META, TICKET_PRIORITY_META } from '../utils/ticketMeta'

/**
 * Karten-Detail (Trello-Muster): 3-Punkte-Menü + Close oben rechts, darunter
 * Erledigt-Toggle (mit Tooltip) + Titel; Selects mit Icons, Beschreibung als
 * UEditor (Markdown, wie Changelog), Checkliste per Drag sortierbar,
 * Mitglieder (Admins/Mods), Footer nur Meta + Speichern.
 * Bleibt GEMOUNTET — v-model:open steuert UModal (Unmount-während-offen
 * hinterlässt sonst verwaistes Teleport-DOM).
 */
const props = defineProps<{
  ticket: TicketRow | null
  lists: TicketListRow[]
}>()
const emit = defineEmits<{ refresh: [] }>()
const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useI18n()
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
const newChecklistItem = ref('')
const busy = ref(false)
const confirmDelete = ref(false)

// Beschreibung hat einen EIGENEN Edit-Zyklus: Änderungen greifen erst mit
// ihrem Speichern-Button; Schließen mit ungespeicherten Änderungen fragt nach
const editingDescription = ref(false)
const descriptionSaved = ref('')
const confirmClose = ref(false)
const descriptionDirty = computed(() => editingDescription.value && form.description !== descriptionSaved.value)

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

// Formular bei jedem neuen Ticket frisch befüllen (syncing unterdrückt
// den Autosave-Watcher während der Befüllung)
const syncing = ref(false)
watch(() => props.ticket?.$id, () => {
  const ticket = props.ticket
  if (!ticket) return
  syncing.value = true
  form.title = ticket.title
  form.listId = ticket.listId
  form.label = fromDb(ticket.label)
  form.priority = fromDb(ticket.priority)
  form.effort = fromDb(ticket.effort)
  form.startAt = toLocalInput(ticket.startAt)
  form.dueAt = toLocalInput(ticket.dueAt)
  form.description = ticket.description
  descriptionSaved.value = ticket.description
  editingDescription.value = false
  confirmClose.value = false
  checklist.value = parseTicketChecklist(ticket.checklist)
  members.value = parseTicketMembers(ticket.membersJson)
  newChecklistItem.value = ''
  confirmDelete.value = false
  void nextTick(() => { syncing.value = false })
}, { immediate: true })

const { users: assignable, avatarById } = useTicketAssignable()

// Markdown-Toolbar wie bei der Changelog-Verwaltung (UEditor, content-type markdown)
const toolbarItems: EditorToolbarItem[] = [
  { kind: 'mark', mark: 'bold', icon: 'i-ph-text-b' },
  { kind: 'mark', mark: 'italic', icon: 'i-ph-text-italic' },
  { kind: 'heading', level: 2, icon: 'i-ph-text-h-two' },
  { kind: 'heading', level: 3, icon: 'i-ph-text-h-three' },
  { kind: 'bulletList', icon: 'i-ph-list-bullets' },
  { kind: 'orderedList', icon: 'i-ph-list-numbers' },
  { kind: 'link', icon: 'i-ph-link' },
  { kind: 'blockquote', icon: 'i-ph-quotes' },
  { kind: 'codeBlock', icon: 'i-ph-code' },
]

const listItems = computed(() => props.lists.map(list => ({ label: list.title, value: list.$id })))
const noneItem = computed(() => ({ label: t('tickets.modal.none'), value: NONE }))
const labelItems = computed(() => [noneItem.value, ...TICKET_LABELS.map(v => ({ label: t(`tickets.labels.${v}`), value: v, icon: TICKET_LABEL_META[v]?.icon }))])
const priorityItems = computed(() => [noneItem.value, ...TICKET_PRIORITIES.map(v => ({ label: t(`tickets.priorities.${v}`), value: v, icon: TICKET_PRIORITY_META[v]?.icon }))])
const effortItems = computed(() => [noneItem.value, ...TICKET_EFFORTS.map(v => ({ label: t(`tickets.efforts.${v}`), value: v, icon: TICKET_EFFORT_META[v]?.icon }))])
const memberItems = computed(() => assignable.value.map(u => ({
  label: u.name,
  value: u.id,
  avatar: { src: u.avatarUrl, alt: u.name },
})))
const memberIds = computed({
  get: () => members.value.map(m => m.id),
  set: (ids: string[]) => {
    const pool = new Map(assignable.value.map(u => [u.id, u]))
    members.value = ids.flatMap((id) => {
      const known = pool.get(id) ?? members.value.find(m => m.id === id)
      return known ? [{ id: known.id, name: known.name }] : []
    })
  },
})
const isMember = computed(() => members.value.some(m => m.id === user.value?.$id))
function joinCard() {
  if (!user.value || isMember.value) return
  members.value = [...members.value, { id: user.value.$id, name: user.value.name ?? '' }]
}

// Checkliste: hinzufügen + Pointer-basiertes Live-Sortieren. BEWUSST kein
// natives HTML5-DnD: dessen Drag-Initiierung ist im Dialog-Kontext
// unzuverlässig (zwei gescheiterte Anläufe) — Pointer-Capture + pointermove
// funktioniert überall, inkl. Touch.
const checkDrag = ref<number | null>(null)
function addChecklistItem() {
  const text = newChecklistItem.value.trim()
  if (!text) return
  checklist.value.push({ text, done: false })
  newChecklistItem.value = ''
}
function startChecklistDrag(event: PointerEvent, index: number) {
  event.preventDefault()
  const handle = event.currentTarget as HTMLElement
  const ul = handle.closest('ul')
  if (!ul) return
  handle.setPointerCapture(event.pointerId)
  checkDrag.value = index

  const onMove = (e: PointerEvent) => {
    const from = checkDrag.value
    if (from === null) return
    const items = [...ul.querySelectorAll<HTMLElement>(':scope > li')]
    let to = from
    items.forEach((li, i) => {
      if (i === from) return
      const rect = li.getBoundingClientRect()
      const middle = rect.top + rect.height / 2
      if (i < from && e.clientY < middle) to = Math.min(to, i)
      if (i > from && e.clientY > middle) to = Math.max(to, i)
    })
    if (to !== from) {
      const [item] = checklist.value.splice(from, 1)
      checklist.value.splice(to, 0, item!)
      checkDrag.value = to
    }
  }
  const onUp = () => {
    checkDrag.value = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

// Beschreibung: eigener Speichern-/Abbrechen-Zyklus
async function saveDescription() {
  const ok = await patch({ description: form.description })
  if (ok) {
    descriptionSaved.value = form.description
    editingDescription.value = false
  }
  return ok
}
function cancelDescription() {
  form.description = descriptionSaved.value
  editingDescription.value = false
}

// Schließen mit ungespeicherter Beschreibung → nachfragen
function requestClose() {
  if (descriptionDirty.value) confirmClose.value = true
  else open.value = false
}
async function saveAndClose() {
  if (await saveDescription()) {
    confirmClose.value = false
    open.value = false
  }
}
function discardAndClose() {
  cancelDescription()
  confirmClose.value = false
  open.value = false
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

// Autosave (Trello-Muster, kein Speichern-Button): jede Feldänderung patcht
// debounct — die Beschreibung hat bewusst ihren EIGENEN Zyklus (unten)
let autosaveTimer: ReturnType<typeof setTimeout> | undefined
watch(
  [() => form.title, () => form.listId, () => form.label, () => form.priority, () => form.effort, () => form.startAt, () => form.dueAt, checklist, members],
  () => {
    if (syncing.value || !props.ticket) return
    clearTimeout(autosaveTimer)
    autosaveTimer = setTimeout(() => { void autosave() }, 600)
  },
  { deep: true },
)
onBeforeUnmount(() => clearTimeout(autosaveTimer))

async function autosave() {
  if (!props.ticket) return
  await patch({
    title: form.title.trim() || props.ticket.title,
    listId: form.listId,
    label: toDb(form.label),
    priority: toDb(form.priority),
    effort: toDb(form.effort),
    startAt: toIso(form.startAt),
    dueAt: toIso(form.dueAt),
    checklist: checklist.value,
    members: members.value,
  })
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
    url: ticketUrl(),
    labels: {
      label: t('tickets.modal.label'), priority: t('tickets.modal.priority'),
      effort: t('tickets.modal.effort'), list: t('tickets.modal.list'),
      due: t('tickets.modal.dueAt'), task: t('tickets.export.task'),
      checklist: t('tickets.modal.checklist'), context: t('tickets.export.context'),
    },
  })
}
function ticketUrl(): string {
  return `${window.location.origin}${window.location.pathname}?ticket=${props.ticket?.$id ?? ''}`
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
  await navigator.clipboard.writeText(ticketUrl())
  toast.add({ title: t('tickets.modal.linkCopied'), color: 'success', icon: 'i-ph-link' })
}

// 3-Punkte-Menü oben rechts (Wunsch David) — Aktionen raus aus dem Footer
const menuItems = computed(() => [[
  { label: t('tickets.modal.share'), icon: 'i-ph-link', onSelect: shareLink },
  { label: t('tickets.modal.duplicate'), icon: 'i-ph-copy', onSelect: duplicate },
], [
  { label: t('tickets.export.copy'), icon: 'i-ph-sparkle', onSelect: copyMarkdown },
  { label: t('tickets.export.download'), icon: 'i-ph-download-simple', onSelect: downloadMarkdown },
], [
  { label: t('tickets.modal.delete'), icon: 'i-ph-trash', color: 'error' as const, onSelect: () => { confirmDelete.value = true } },
]])

const createdAtText = computed(() =>
  props.ticket ? new Date(props.ticket.$createdAt).toLocaleString(locale.value) : '')
</script>

<template>
  <!-- #body statt #content — bewährtes Muster (comments.vue); kein title/close-Prop,
       damit UModal keinen doppelten Header rendert (eigene Kopfzeile unten) -->
  <UModal
    v-model:open="open"
    :close="false"
    :dismissible="!descriptionDirty"
    :ui="{ content: 'max-w-2xl' }"
    @close:prevent="confirmClose = true"
  >
    <template #body>
      <div v-if="ticket" class="max-h-[80vh] overflow-y-auto" data-testid="ticket-modal">
        <div class="flex items-center justify-end gap-1">
          <UDropdownMenu :items="menuItems">
            <UButton icon="i-ph-dots-three-bold" color="neutral" variant="ghost" :aria-label="t('tickets.modal.actions')" data-testid="ticket-menu" />
          </UDropdownMenu>
          <UButton icon="i-ph-x" color="neutral" variant="ghost" :aria-label="t('tickets.modal.close')" data-testid="ticket-close" @click="requestClose" />
        </div>

        <div class="mt-1 flex items-start gap-2">
          <UTooltip :text="ticket.status === 'done' ? t('tickets.modal.markOpen') : t('tickets.modal.markDone')">
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
          </UTooltip>
          <UInput v-model="form.title" size="xl" variant="ghost" class="flex-1 font-semibold" />
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
          <UAvatarGroup v-if="members.length" size="xs" :max="6" class="mt-2">
            <UAvatar
              v-for="member in members"
              :key="member.id"
              :src="avatarById.get(member.id)"
              :alt="member.name"
              :title="member.name"
            />
          </UAvatarGroup>
        </UFormField>

        <div class="mt-5">
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold">{{ t('tickets.modal.description') }}</h3>
            <UButton
              v-if="!editingDescription"
              icon="i-ph-pencil-simple"
              color="neutral" variant="ghost" size="xs"
              data-testid="description-edit"
              @click="editingDescription = true"
            >
              {{ t('tickets.modal.edit') }}
            </UButton>
          </div>

          <template v-if="editingDescription">
            <UEditor
              v-slot="{ editor }"
              v-model="form.description"
              content-type="markdown"
              class="w-full rounded-md border border-default"
              :ui="{ base: 'px-3 sm:px-3 py-2', content: 'min-h-32' }"
            >
              <UEditorToolbar :editor="editor" :items="toolbarItems" class="border-b border-default px-1.5 py-1" />
            </UEditor>
            <div class="mt-2 flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" size="sm" @click="cancelDescription">{{ t('ui.cancel') }}</UButton>
              <UButton color="primary" size="sm" :loading="busy" data-testid="description-save" @click="() => { void saveDescription() }">
                {{ t('ui.save') }}
              </UButton>
            </div>
          </template>
          <template v-else>
            <MarkdownContent v-if="descriptionSaved" :source="descriptionSaved" class="text-sm" />
            <p v-else class="text-sm text-muted">{{ t('tickets.modal.noDescription') }}</p>
          </template>
        </div>

        <div class="mt-5">
          <h3 class="text-sm font-semibold">
            {{ t('tickets.modal.checklist') }}
            <span v-if="checklist.length" class="ms-1 text-xs font-normal text-muted">
              {{ checklist.filter(i => i.done).length }}/{{ checklist.length }}
            </span>
          </h3>
          <ul class="mt-2 space-y-1.5">
            <li
              v-for="(item, itemIndex) in checklist"
              :key="itemIndex"
              class="flex items-center gap-2 rounded px-1 transition-colors"
              :class="checkDrag === itemIndex ? 'bg-elevated ring-1 ring-primary/40' : ''"
            >
              <UIcon
                name="i-ph-dots-six-vertical"
                class="size-4 shrink-0 cursor-grab touch-none text-dimmed active:cursor-grabbing"
                :aria-label="t('tickets.modal.reorderItem')"
                data-testid="check-handle"
                @pointerdown="startChecklistDrag($event, itemIndex)"
              />
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

        <div v-if="confirmDelete" class="mt-6 flex items-center justify-between gap-2 rounded-lg border border-error/40 bg-error/5 p-3">
          <p class="text-sm text-error">{{ t('tickets.modal.deleteConfirmText') }}</p>
          <div class="flex gap-2">
            <UButton color="neutral" variant="ghost" size="sm" @click="confirmDelete = false">{{ t('ui.cancel') }}</UButton>
            <UButton color="error" size="sm" :loading="busy" @click="remove">{{ t('tickets.modal.delete') }}</UButton>
          </div>
        </div>

        <!-- Kein Speichern-Button — Änderungen sichern sich selbst (Autosave);
             nur die Beschreibung hat ihren eigenen Speichern-Zyklus -->
        <div class="mt-6 border-t border-default pt-4">
          <p class="text-xs text-muted">
            {{ t('tickets.modal.createdBy', { name: ticket.createdByName || '—', date: createdAtText }) }}
          </p>
        </div>
      </div>
    </template>
  </UModal>

  <!-- Ungespeicherte Beschreibung beim Schließen — speichern oder verwerfen? -->
  <UModal
    :open="confirmClose"
    :title="t('tickets.modal.unsavedTitle')"
    @update:open="(value: boolean) => { if (!value) confirmClose = false }"
  >
    <template #body>
      <p class="text-sm">{{ t('tickets.modal.unsavedText') }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" data-testid="unsaved-discard" @click="discardAndClose">
          {{ t('tickets.modal.dontSave') }}
        </UButton>
        <UButton color="primary" :loading="busy" data-testid="unsaved-save" @click="saveAndClose">
          {{ t('ui.save') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

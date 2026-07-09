<script setup lang="ts">
import type { TicketListRow, TicketRow, TicketSort } from '../../shared/types/ticket'

/**
 * Eine Board-Spalte: Header (Inline-Rename, Zähler, Aktionen-Menü), Karten
 * mit nativem Drag & Drop im Trello-Muster — gekippte Drag-Vorschau,
 * Original ausgegraut, Einfüge-PLATZHALTER in Kartengröße statt Linie.
 * Listen-Drag meldet Hover/Drop nach oben (die Seite rendert den
 * Spalten-Platzhalter zwischen den Listen).
 */
const props = defineProps<{
  list: TicketListRow
  tickets: TicketRow[]
  index: number
}>()
const emit = defineEmits<{
  open: [ticket: TicketRow]
  moveCard: [ticketId: string, index: number]
  listHover: [index: number]
  listDrop: []
  refresh: []
}>()

const { t } = useI18n()
const toast = useToast()

// Geteilter Drag-Zustand über alle Spalten (useState statt Prop-Drilling)
const drag = useState<{ type: 'card' | 'list', id: string, height: number } | null>('tickets-drag', () => null)
const hoverIndex = ref<number | null>(null)

/** Trello-Kippeffekt: Klon als Drag-Image, 4° rotiert (Original bleibt im Fluss) */
function tiltedDragImage(event: DragEvent) {
  const source = event.currentTarget as HTMLElement
  const clone = source.cloneNode(true) as HTMLElement
  clone.style.cssText = `position:fixed;top:-1000px;left:-1000px;width:${source.offsetWidth}px;transform:rotate(4deg);pointer-events:none;`
  document.body.appendChild(clone)
  event.dataTransfer?.setDragImage(clone, event.offsetX, event.offsetY)
  setTimeout(() => clone.remove(), 0)
}

function onCardDragStart(event: DragEvent, ticket: TicketRow) {
  // setData ist für Firefox Pflicht, sonst startet der Drag nicht
  event.dataTransfer?.setData('text/plain', ticket.$id)
  tiltedDragImage(event)
  drag.value = { type: 'card', id: ticket.$id, height: (event.currentTarget as HTMLElement).offsetHeight }
}
function onHeaderDragStart(event: DragEvent) {
  event.dataTransfer?.setData('text/plain', props.list.$id)
  const column = (event.currentTarget as HTMLElement).closest('section')
  event.dataTransfer?.setDragImage(column ?? (event.currentTarget as HTMLElement), event.offsetX, event.offsetY)
  drag.value = { type: 'list', id: props.list.$id, height: column?.offsetHeight ?? 120 }
}
function onDragEnd() {
  drag.value = null
  hoverIndex.value = null
}

/** Einfüge-Index: obere Kartenhälfte = davor, untere = danach */
function onCardDragOver(event: DragEvent, cardIndex: number) {
  if (drag.value?.type !== 'card') return
  const el = event.currentTarget as HTMLElement
  hoverIndex.value = cardIndex + (event.offsetY > el.offsetHeight / 2 ? 1 : 0)
}
function onColumnDragOver(event: DragEvent) {
  event.preventDefault()
  if (drag.value?.type === 'card') {
    if (hoverIndex.value === null) hoverIndex.value = props.tickets.length
  }
  else if (drag.value?.type === 'list') {
    const el = event.currentTarget as HTMLElement
    emit('listHover', props.index + (event.offsetX > el.offsetWidth / 2 ? 1 : 0))
  }
}
function onColumnDragLeave(event: DragEvent) {
  // nur zurücksetzen, wenn die Spalte wirklich verlassen wird (nicht Kind-Elemente)
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) hoverIndex.value = null
}
function onColumnDrop() {
  const current = drag.value
  if (current?.type === 'card') {
    emit('moveCard', current.id, hoverIndex.value ?? props.tickets.length)
  }
  else if (current?.type === 'list' && current.id !== props.list.$id) {
    emit('listDrop')
  }
  onDragEnd()
}

// Inline-Rename
const renaming = ref(false)
const renameValue = ref('')
function startRename() {
  renameValue.value = props.list.title
  renaming.value = true
}
async function saveRename() {
  renaming.value = false
  const title = renameValue.value.trim()
  if (!title || title === props.list.title) return
  try {
    await $fetch(`/api/tickets/lists/${props.list.$id}`, { method: 'PATCH', body: { title } })
    emit('refresh')
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
  }
}

// Karte hinzufügen (inline)
const adding = ref(false)
const newTitle = ref('')
async function addCard() {
  const title = newTitle.value.trim()
  if (!title) {
    adding.value = false
    return
  }
  try {
    await $fetch('/api/tickets', { method: 'POST', body: { listId: props.list.$id, title } })
    newTitle.value = ''
    emit('refresh')
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
  }
}

async function listAction(action: 'duplicate' | 'delete' | TicketSort) {
  try {
    if (action === 'duplicate') {
      await $fetch(`/api/tickets/lists/${props.list.$id}/duplicate`, { method: 'POST' })
    }
    else if (action === 'delete') {
      await $fetch(`/api/tickets/lists/${props.list.$id}`, { method: 'DELETE' })
    }
    else {
      await $fetch(`/api/tickets/lists/${props.list.$id}/sort`, { method: 'POST', body: { by: action } })
    }
    emit('refresh')
  }
  catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({
      title: statusCode === 409 ? t('tickets.errors.listNotEmpty') : t('tickets.errors.action'),
      color: 'error',
    })
  }
}

const menuItems = computed(() => [[
  { label: t('tickets.list.addCard'), icon: 'i-ph-plus', onSelect: () => { adding.value = true } },
  { label: t('tickets.list.rename'), icon: 'i-ph-pencil-simple', onSelect: startRename },
  { label: t('tickets.list.duplicate'), icon: 'i-ph-copy', onSelect: () => listAction('duplicate') },
], [
  { label: t('tickets.list.sortNewest'), icon: 'i-ph-sort-descending', onSelect: () => listAction('createdDesc') },
  { label: t('tickets.list.sortOldest'), icon: 'i-ph-sort-ascending', onSelect: () => listAction('createdAsc') },
  { label: t('tickets.list.sortAlpha'), icon: 'i-ph-text-aa', onSelect: () => listAction('alpha') },
], [
  { label: t('tickets.list.delete'), icon: 'i-ph-trash', color: 'error' as const, onSelect: () => listAction('delete') },
]])
</script>

<template>
  <section
    class="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-elevated/60 transition"
    :class="drag?.type === 'list' && drag.id === list.$id ? 'opacity-40 grayscale' : ''"
    :data-list="list.$id"
    @dragover="onColumnDragOver"
    @dragleave="onColumnDragLeave"
    @drop.prevent="onColumnDrop"
  >
    <header
      class="flex cursor-grab items-center gap-2 p-3 active:cursor-grabbing"
      draggable="true"
      @dragstart="onHeaderDragStart"
      @dragend="onDragEnd"
    >
      <UInput
        v-if="renaming"
        v-model="renameValue"
        size="sm"
        autofocus
        class="flex-1"
        @blur="saveRename"
        @keydown.enter="saveRename"
        @keydown.escape="renaming = false"
      />
      <h2 v-else class="min-w-0 flex-1 truncate text-sm font-semibold" @dblclick="startRename">
        {{ list.title }}
      </h2>
      <span class="text-xs tabular-nums text-muted" data-testid="list-count">{{ tickets.length }}</span>
      <UDropdownMenu :items="menuItems">
        <UButton icon="i-ph-dots-three-bold" color="neutral" variant="ghost" size="xs" :aria-label="t('tickets.list.actions')" />
      </UDropdownMenu>
    </header>

    <div class="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
      <template v-for="(ticket, cardIndex) in tickets" :key="ticket.$id">
        <!-- Platzhalter in Kartengröße (Trello-Muster) statt dünner Linie -->
        <div
          v-if="drag?.type === 'card' && hoverIndex === cardIndex && drag.id !== ticket.$id"
          class="rounded-lg bg-accented/40"
          :style="{ height: `${drag.height}px` }"
        />
        <div
          draggable="true"
          :class="drag?.id === ticket.$id ? 'opacity-40 grayscale' : ''"
          @dragstart="onCardDragStart($event, ticket)"
          @dragend="onDragEnd"
          @dragover.prevent="onCardDragOver($event, cardIndex)"
        >
          <TicketBoardCard :ticket="ticket" @open="emit('open', ticket)" />
        </div>
      </template>
      <div
        v-if="drag?.type === 'card' && hoverIndex === tickets.length"
        class="rounded-lg bg-accented/40"
        :style="{ height: `${drag.height}px` }"
      />

      <form v-if="adding" @submit.prevent="addCard">
        <UInput
          v-model="newTitle"
          size="sm"
          autofocus
          :placeholder="t('tickets.list.cardTitlePlaceholder')"
          class="w-full"
          @keydown.escape="adding = false"
          @blur="!newTitle.trim() && (adding = false)"
        />
      </form>
    </div>

    <footer class="p-2 pt-0">
      <UButton
        v-if="!adding"
        icon="i-ph-plus"
        color="neutral"
        variant="ghost"
        size="sm"
        block
        class="justify-start"
        data-testid="add-card"
        @click="adding = true"
      >
        {{ t('tickets.list.addCard') }}
      </UButton>
    </footer>
  </section>
</template>

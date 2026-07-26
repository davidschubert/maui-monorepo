<script setup lang="ts">
import type { TicketListRow, TicketRow, TicketSort } from '../../shared/types/ticket'

/**
 * Eine Board-Spalte: Header (Inline-Rename, Zähler, Aktionen-Menü), Karten
 * mit nativem Drag & Drop im Trello-Muster — gekippte Drag-Vorschau,
 * Original ausgegraut, Einfüge-PLATZHALTER in Kartengröße statt Linie.
 * Listen-Drag meldet Hover/Drop nach oben (die Seite rendert den
 * Spalten-Platzhalter zwischen den Listen).
 *
 * Karten-Container ist eine TransitionGroup: Nachrücken/Platzmachen läuft
 * als FLIP (Kurven siehe <style>, nachgemessen am Referenz-Motion-Design).
 * WÄHREND des Drags ist die Animation live ([data-dragging], schnelle
 * 200-ms-Kurve): die Karten gleiten auseinander, wo der Platzhalter
 * hinwandert — das IST die DnD-Animation (Davids Feedback 2026-07-26).
 * Beim Loslassen dagegen sitzt die Karte sofort: einen Frame nach dem
 * Drop sind die Transitions aus ([data-settling]), sonst gleitet die
 * gedroppte Karte sichtbar vom alten Slot herüber. Kartenflüge
 * (useTicketBoardFlight) gibt es nur für nicht selbst gezogene Wechsel;
 * [data-incoming] setzt das Composable, während ein Flug landet.
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
// Nach dem Drop bleibt die FLIP-Transition einen Frame aus (geteilt, s. o.)
const settling = useState<boolean>('tickets-drag-settling', () => false)

// Chromium friert :hover beim nativen DnD auf der Dragstart-Position ein und
// wertet erst bei der nächsten Mausbewegung neu aus — bis dahin trüge sonst
// die Karte, die an die alte Stelle nachgerückt ist, den Hover-Rahmen.
// Solange „eingefroren": Hover-Optik der Karten neutralisieren (CSS unten).
const hoverFrozen = useState<boolean>('tickets-hover-frozen', () => false)
function unfreezeHover() {
  hoverFrozen.value = false
}
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', unfreezeHover)
})

/**
 * Karten + Einfüge-Platzhalter als EINE flache, durchgehend gekeyte Liste —
 * die TransitionGroup verträgt keine Fragmente (template v-for mit zwei
 * Wurzeln), jedes Kind braucht genau ein Element mit Key.
 */
type RenderItem
  = | { kind: 'card', key: string, ticket: TicketRow, index: number }
    | { kind: 'placeholder', key: string }
const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = []
  let slot = drag.value?.type === 'card' ? hoverIndex.value : null
  if (slot !== null) {
    // Slots direkt vor/hinter der gezogenen Karte sind No-ops — kein
    // Platzhalter (die Karte läge dort, wo sie ohnehin schon sitzt);
    // gleiche Regel wie beim Listen-Drag in onListHover
    const dragIndex = props.tickets.findIndex(ticket => ticket.$id === drag.value?.id)
    if (dragIndex !== -1 && (slot === dragIndex || slot === dragIndex + 1)) slot = null
  }
  props.tickets.forEach((ticket, index) => {
    if (slot === index) items.push({ kind: 'placeholder', key: `slot-${index}` })
    items.push({ kind: 'card', key: ticket.$id, ticket, index })
  })
  if (slot === props.tickets.length) items.push({ kind: 'placeholder', key: 'slot-end' })
  return items
})

/** Trello-Kippeffekt: Klon als Drag-Image, 4° rotiert + Flug-Schatten aus dem
    Referenz-Motion-Design (Original bleibt im Fluss) */
function tiltedDragImage(event: DragEvent) {
  const source = event.currentTarget as HTMLElement
  const clone = source.cloneNode(true) as HTMLElement
  clone.style.cssText = `position:fixed;top:-1000px;left:-1000px;width:${source.offsetWidth}px;transform:rotate(4deg);pointer-events:none;box-shadow:0 12px 32px rgb(0 0 0 / 0.18);border-radius:0.5rem;`
  document.body.appendChild(clone)
  event.dataTransfer?.setDragImage(clone, event.offsetX, event.offsetY)
  setTimeout(() => clone.remove(), 0)
}

function onCardDragStart(event: DragEvent, ticket: TicketRow) {
  // setData ist für Firefox Pflicht; effectAllowed 'move' verhindert die
  // Zurückschnapp-Animation des Browsers nach dem Drop (fühlte sich wie ~1s Lag an)
  event.dataTransfer?.setData('text/plain', ticket.$id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  tiltedDragImage(event)
  hoverFrozen.value = true
  drag.value = { type: 'card', id: ticket.$id, height: (event.currentTarget as HTMLElement).offsetHeight }
}
function onHeaderDragStart(event: DragEvent) {
  event.dataTransfer?.setData('text/plain', props.list.$id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  const column = (event.currentTarget as HTMLElement).closest('section')
  event.dataTransfer?.setDragImage(column ?? (event.currentTarget as HTMLElement), event.offsetX, event.offsetY)
  hoverFrozen.value = true
  drag.value = { type: 'list', id: props.list.$id, height: column?.offsetHeight ?? 120 }
}
function onDragEnd() {
  drag.value = null
  hoverIndex.value = null
  // Re-Render nach dem Drop passiert im nächsten Frame — solange bleiben die
  // Move-Transitions aus, damit die gedroppte Karte sofort im Ziel-Slot sitzt
  settling.value = true
  requestAnimationFrame(() => requestAnimationFrame(() => { settling.value = false }))
  // Hover bleibt neutralisiert, bis die Maus sich wirklich wieder bewegt
  window.addEventListener('pointermove', unfreezeHover, { once: true })
}

/** Einfüge-Index: obere Kartenhälfte = davor, untere = danach */
function onCardDragOver(event: DragEvent, cardIndex: number) {
  if (drag.value?.type !== 'card') return
  const el = event.currentTarget as HTMLElement
  hoverIndex.value = cardIndex + (event.offsetY > el.offsetHeight / 2 ? 1 : 0)
}
function onColumnDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
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

// Lösch-Bestätigung (immer fragen — löscht Liste MITSAMT Karten)
const confirmingDelete = ref(false)
const deleting = ref(false)
async function deleteList() {
  deleting.value = true
  try {
    await $fetch(`/api/tickets/lists/${props.list.$id}`, { method: 'DELETE' })
    confirmingDelete.value = false
    emit('refresh')
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
  }
  finally {
    deleting.value = false
  }
}

async function listAction(action: 'duplicate' | TicketSort) {
  try {
    if (action === 'duplicate') {
      await $fetch(`/api/tickets/lists/${props.list.$id}/duplicate`, { method: 'POST' })
    }
    else {
      await $fetch(`/api/tickets/lists/${props.list.$id}/sort`, { method: 'POST', body: { by: action } })
    }
    emit('refresh')
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
  }
}

/**
 * Menü-Aktionen, die ein Eingabefeld fokussieren, MÜSSEN warten: das
 * schließende Dropdown gibt den Fokus an den Trigger zurück und blurt sonst
 * das frisch geöffnete Feld sofort wieder (sprang nach ~1s raus).
 */
function afterMenuClose(action: () => void) {
  setTimeout(action, 150)
}

const menuItems = computed(() => [[
  { label: t('tickets.list.addCard'), icon: 'i-ph-plus', onSelect: () => afterMenuClose(() => { adding.value = true }) },
  { label: t('tickets.list.rename'), icon: 'i-ph-pencil-simple', onSelect: () => afterMenuClose(startRename) },
  { label: t('tickets.list.duplicate'), icon: 'i-ph-copy', onSelect: () => listAction('duplicate') },
], [
  { label: t('tickets.list.sortNewest'), icon: 'i-ph-sort-descending', onSelect: () => listAction('createdDesc') },
  { label: t('tickets.list.sortOldest'), icon: 'i-ph-sort-ascending', onSelect: () => listAction('createdAsc') },
  { label: t('tickets.list.sortAlpha'), icon: 'i-ph-text-aa', onSelect: () => listAction('alpha') },
], [
  { label: t('tickets.list.delete'), icon: 'i-ph-trash', color: 'error' as const, onSelect: () => { confirmingDelete.value = true } },
]])
</script>

<template>
  <section
    class="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-elevated/60 transition"
    :class="drag?.type === 'list' && drag.id === list.$id ? 'opacity-40 grayscale' : ''"
    :data-list="list.$id"
    :data-dragging="drag ? '' : undefined"
    :data-settling="settling ? '' : undefined"
    :data-hover-frozen="hoverFrozen ? '' : undefined"
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
        @keydown.escape="() => { renaming = false }"
      />
      <h2 v-else class="min-w-0 flex-1 truncate text-sm font-semibold" @dblclick="startRename">
        {{ list.title }}
      </h2>
      <span class="text-xs tabular-nums text-muted" data-testid="list-count">{{ tickets.length }}</span>
      <UDropdownMenu :items="menuItems">
        <UButton icon="i-ph-dots-three-bold" color="neutral" variant="ghost" size="xs" :aria-label="t('tickets.list.actions')" />
      </UDropdownMenu>
    </header>

    <TransitionGroup
      tag="div"
      name="board-card"
      class="flex-1 space-y-2 overflow-y-auto px-2 pb-2"
      data-cards
    >
      <!-- Platzhalter in Kartengröße (Trello-Muster) statt dünner Linie -->
      <div
        v-for="item in renderItems"
        :key="item.key"
        :draggable="item.kind === 'card'"
        :class="item.kind === 'card' && drag?.id === item.ticket.$id ? 'opacity-40 grayscale' : ''"
        @dragstart="item.kind === 'card' ? onCardDragStart($event, item.ticket) : undefined"
        @dragend="onDragEnd"
        @dragover.prevent="item.kind === 'card' ? onCardDragOver($event, item.index) : undefined"
      >
        <TicketBoardCard v-if="item.kind === 'card'" :ticket="item.ticket" @open="emit('open', item.ticket)" />
        <div v-else class="rounded-lg bg-accented/40" :style="{ height: `${drag?.height ?? 0}px` }" />
      </div>

      <form v-if="adding" key="add-form" @submit.prevent="addCard">
        <UInput
          v-model="newTitle"
          size="sm"
          autofocus
          :placeholder="t('tickets.list.cardTitlePlaceholder')"
          class="w-full"
          @keydown.escape="() => { adding = false }"
          @blur="!newTitle.trim() && (adding = false)"
        />
      </form>
    </TransitionGroup>

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
        @click="() => { adding = true }"
      >
        {{ t('tickets.list.addCard') }}
      </UButton>
    </footer>

    <!-- Löschen IMMER bestätigen — nicht-leere Listen nehmen ihre Karten mit -->
    <UModal
      :open="confirmingDelete"
      :title="t('tickets.list.deleteConfirmTitle', { title: list.title })"
      @update:open="(value: boolean) => { if (!value) confirmingDelete = false }"
    >
      <template #body>
        <p class="text-sm">
          {{ tickets.length > 0
            ? t('tickets.list.deleteConfirmWithCards', { count: tickets.length })
            : t('tickets.list.deleteConfirmEmpty') }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { confirmingDelete = false }">{{ t('ui.cancel') }}</UButton>
          <UButton color="error" :loading="deleting" data-testid="confirm-delete-list" @click="deleteList">
            {{ t('tickets.list.delete') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </section>
</template>

<style scoped>
/* Nachrücken/Platzmachen (FLIP): Kurve nachgemessen am Referenz-Motion-
   Design — ease-in-out mit betont langem Ausklang, 450 ms */
.board-card-move {
  transition: transform 450ms cubic-bezier(0.5, 0, 0.15, 1);
}

/* Entfernte Karten sofort aus dem Fluss nehmen: bleibt der Leaver bis zum
   nächsten Frame stehen, sieht die FLIP-Messung keine Positionsänderung und
   die Nachbarn springen statt nachzurücken */
.board-card-leave-active {
  display: none;
}

/* Zielspalte eines Kartenflugs (useTicketBoardFlight): der Slot öffnet sich
   erst kurz vor der Landung — beschleunigendes „Wegdrücken" (ease-in),
   330 ms mit 350 ms Verzögerung, fertig kurz bevor der Klon aufsetzt */
[data-incoming] .board-card-move {
  transition: transform 330ms cubic-bezier(0.55, 0.05, 0.8, 0.5) 350ms;
}

/* WÄHREND des Drags: Live-Platzmachen — die Karten gleiten schnell und
   knackig auseinander/zusammen, wo der Platzhalter hinwandert. Kurz genug,
   um dem Cursor zu folgen, ohne träge zu wirken */
section[data-dragging] .board-card-move {
  transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
}

/* Einen Frame nach dem Drop keine FLIP-Moves: die gedroppte Karte muss
   sofort im Ziel-Slot sitzen statt vom alten Slot herüberzugleiten
   (steht nach der Drag-Regel — gewinnt bei gleichzeitigem Zutreffen) */
section[data-settling] .board-card-move {
  transition: none;
}

/* Chromium lässt :hover nach nativem DnD bis zur nächsten Mausbewegung auf
   der Dragstart-Position stehen — die nachgerückte Karte wirkte „aktiv".
   Solange eingefroren: Hover-Rahmen ALLER Karten neutralisieren (unlayerte
   Komponenten-Regel schlägt die Tailwind-Utility hover:border-primary/50) */
section[data-hover-frozen] [data-ticket] {
  border-color: var(--ui-border);
}

/* Der Karten-Container scrollt weiter, zeigt aber nie einen Scrollbalken —
   die FLIP-Transforms ließen ihn sonst sekundenweise aufblitzen */
[data-cards] {
  scrollbar-width: none;
}
[data-cards]::-webkit-scrollbar {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .board-card-move,
  section[data-dragging] .board-card-move {
    transition: none;
  }
}
</style>

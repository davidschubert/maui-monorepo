<script setup lang="ts">
import type { TicketRow } from '../../../shared/types/ticket'

/**
 * Ticket-Board (Trello-Muster, Plan docs/plans/TICKETS-BOARD.md): horizontal
 * scrollende Listen, natives DnD (Karten + Listen), Deep-Link ?ticket=<id>
 * öffnet das Karten-Modal (teilbar). Operator-only (tickets.manage).
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'tickets.manage' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()

useHead({ title: () => t('tickets.board.title') })

const { data, lists, ticketsByList, refresh, error, moveTicket, moveList } = useTicketBoard()

// Board-Einstellungen (KI-Modell-Wechsel)
const settingsOpen = ref(false)

// Beobachtet-Ansicht (P4): Slideover mit allen Tickets, denen ich folge —
// inkl. Ausschalten direkt aus der Liste
const watchingOpen = ref(false)
const { watchedTickets, watchedIds, toggleWatch, refresh: refreshWatching } = useTicketWatching()
const unwatchBusy = ref('')
async function unwatch(ticketId: string) {
  unwatchBusy.value = ticketId
  try {
    await toggleWatch(ticketId)
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
  }
  finally {
    unwatchBusy.value = ''
  }
}
function openWatched(ticketId: string) {
  watchingOpen.value = false
  const ticket = data.value?.tickets.find(item => item.$id === ticketId)
  if (ticket) open(ticket)
}

// Modal bleibt gemountet (v-model:open) — der Query-Param trägt den Deep-Link
const modalOpen = ref(false)
const selectedId = ref<string | null>(null)
const selectedTicket = computed<TicketRow | null>(() =>
  data.value?.tickets.find(ticket => ticket.$id === selectedId.value) ?? null)

function open(ticket: TicketRow) {
  selectedId.value = ticket.$id
  modalOpen.value = true
  void router.replace({ query: { ...route.query, ticket: ticket.$id } })
}
watch(modalOpen, (value) => {
  if (value) return
  const query = { ...route.query }
  delete query.ticket
  void router.replace({ query })
})
// Deep-Link (?ticket=<id>) öffnet, sobald die Daten da sind
watch([() => route.query.ticket, () => data.value?.tickets.length], () => {
  const id = route.query.ticket
  if (typeof id === 'string' && data.value?.tickets.some(ticket => ticket.$id === id)) {
    selectedId.value = id
    modalOpen.value = true
  }
}, { immediate: true })

function onMoveCard(ticketId: string, listId: string, index: number) {
  const ticket = data.value?.tickets.find(item => item.$id === ticketId)
  if (ticket) void moveTicket(ticket, listId, index)
}

// Listen-DnD: die Spalten melden den Hover-Slot, die Seite rendert den
// Platzhalter zwischen den Listen (Trello-Muster) und führt den Drop aus
const drag = useState<{ type: 'card' | 'list', id: string, height: number } | null>('tickets-drag', () => null)
const listHoverIndex = ref<number | null>(null)
watch(drag, (value) => { if (!value) listHoverIndex.value = null })

function onListHover(slot: number) {
  const current = drag.value
  if (current?.type !== 'list') return
  // Slots direkt vor/hinter der eigenen Position sind No-ops — kein Platzhalter
  const sourceIndex = lists.value.findIndex(item => item.$id === current.id)
  listHoverIndex.value = (slot === sourceIndex || slot === sourceIndex + 1) ? null : slot
}

/** Der Platzhalter selbst MUSS Drop-Target sein — der Cursor steht beim
    Loslassen genau darüber (ohne preventDefault bricht der Browser den Drag ab) */
function onPlaceholderDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onListDrop() {
  const current = drag.value
  if (current?.type !== 'list' || listHoverIndex.value === null) return
  const list = lists.value.find(item => item.$id === current.id)
  if (list) void moveList(list, listHoverIndex.value)
  listHoverIndex.value = null
  drag.value = null
}

// Liste hinzufügen (rechts außen, Trello-Muster)
const addingList = ref(false)
const newListTitle = ref('')
async function addList() {
  const title = newListTitle.value.trim()
  if (!title) {
    addingList.value = false
    return
  }
  try {
    await $fetch('/api/tickets/lists', { method: 'POST', body: { title } })
    newListTitle.value = ''
    addingList.value = false
    await refresh()
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="tickets-board">
    <template #header>
      <UDashboardNavbar :title="t('tickets.board.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-eye"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="watching-open"
            @click="() => { watchingOpen = true; void refreshWatching() }"
          >
            {{ t('tickets.watch.listTitle') }}
            <UBadge v-if="watchedIds.size" color="neutral" variant="subtle" size="sm">{{ watchedIds.size }}</UBadge>
          </UButton>
          <UTooltip :text="t('tickets.settings.title')">
            <UButton
              icon="i-ph-gear"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('tickets.settings.title')"
              data-testid="board-settings-open"
              @click="() => { settingsOpen = true }"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Subline unter der Headline (nicht daneben — Konvention der App) -->
      <p class="mb-3 text-sm text-muted">{{ t('tickets.board.subtitle') }}</p>

      <!-- Fetch-Fehler NIE als leeres Board maskieren (401/Session/Netz) -->
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-ph-warning"
        :title="t('tickets.board.loadFailed')"
        class="mb-4"
        data-testid="board-error"
        :actions="[{ label: t('tickets.board.retry'), color: 'error', variant: 'solid', onClick: () => { void refresh() } }]"
      />

      <!-- Kein v-if-Branch-Swap: SSR (idle) und Client (pending) rendern sonst
           unterschiedliche Zweige → Hydration-Mismatch, der spätere Unmounts
           (Modal-Teleport) mit vDOM-Fehlern crashen lässt -->
      <div class="flex h-full items-start gap-4 overflow-x-auto pb-4" data-testid="ticket-board">
        <template v-for="(list, index) in lists" :key="list.$id">
          <!-- Spalten-Platzhalter beim Listen-Drag (Trello-Muster) — selbst
               Drop-Target, der Cursor steht beim Loslassen genau darüber -->
          <div
            v-if="drag?.type === 'list' && listHoverIndex === index && drag.id !== list.$id"
            class="w-72 shrink-0 rounded-xl bg-accented/40"
            :style="{ height: `${Math.min(drag.height, 480)}px` }"
            @dragover="onPlaceholderDragOver"
            @drop.prevent="onListDrop"
          />
          <TicketBoardList
            :list="list"
            :tickets="ticketsByList.get(list.$id) ?? []"
            :index="index"
            @open="open"
            @move-card="(ticketId, cardIndex) => onMoveCard(ticketId, list.$id, cardIndex)"
            @list-hover="onListHover"
            @list-drop="onListDrop"
            @refresh="refresh"
          />
        </template>
        <div
          v-if="drag?.type === 'list' && listHoverIndex === lists.length"
          class="w-72 shrink-0 rounded-xl bg-accented/40"
          :style="{ height: `${Math.min(drag.height, 480)}px` }"
          @dragover="onPlaceholderDragOver"
          @drop.prevent="onListDrop"
        />

        <div class="w-72 shrink-0">
          <form v-if="addingList" class="rounded-xl bg-elevated/60 p-2" @submit.prevent="addList">
            <UInput
              v-model="newListTitle"
              size="sm"
              autofocus
              :placeholder="t('tickets.board.listTitlePlaceholder')"
              class="w-full"
              @keydown.escape="() => { addingList = false }"
              @blur="!newListTitle.trim() && (addingList = false)"
            />
          </form>
          <UButton
            v-else
            icon="i-ph-plus"
            color="neutral"
            variant="subtle"
            block
            class="justify-start"
            data-testid="add-list"
            @click="() => { addingList = true }"
          >
            {{ t('tickets.board.addList') }}
          </UButton>
        </div>
      </div>

      <TicketModal
        v-model:open="modalOpen"
        :ticket="selectedTicket"
        :lists="lists"
        @refresh="refresh"
      />

      <TicketBoardSettings v-model:open="settingsOpen" />

      <!-- Beobachtet-Ansicht (P4): folgen/entfolgen zentral an einem Ort -->
      <USlideover v-model:open="watchingOpen" :title="t('tickets.watch.listTitle')" :description="t('tickets.watch.listDescription')">
        <template #body>
          <p v-if="!watchedTickets.length" class="py-8 text-center text-sm text-muted">
            {{ t('tickets.watch.empty') }}
          </p>
          <ul v-else class="divide-y divide-default" data-testid="watching-list">
            <li v-for="ticket in watchedTickets" :key="ticket.$id" class="flex items-center gap-2 py-3">
              <button type="button" class="min-w-0 flex-1 cursor-pointer text-start" @click="openWatched(ticket.$id)">
                <p class="truncate text-sm font-medium hover:text-primary">{{ ticket.title }}</p>
                <p class="text-xs text-muted">
                  {{ ticket.listTitle }}
                  <template v-if="ticket.status === 'done'"> · ✅</template>
                </p>
              </button>
              <UTooltip :text="t('tickets.watch.stop')">
                <UButton
                  icon="i-ph-eye-slash"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :loading="unwatchBusy === ticket.$id"
                  :data-unwatch="ticket.$id"
                  @click="unwatch(ticket.$id)"
                />
              </UTooltip>
            </li>
          </ul>
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>

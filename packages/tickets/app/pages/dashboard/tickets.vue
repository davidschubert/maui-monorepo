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

const { data, lists, ticketsByList, refresh, moveTicket, moveList } = useTicketBoard()

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
function onMoveList(listId: string, index: number) {
  const list = lists.value.find(item => item.$id === listId)
  if (list) void moveList(list, index)
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
        <template #trailing>
          <span class="text-sm text-muted">{{ t('tickets.board.subtitle') }}</span>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Kein v-if-Branch-Swap: SSR (idle) und Client (pending) rendern sonst
           unterschiedliche Zweige → Hydration-Mismatch, der spätere Unmounts
           (Modal-Teleport) mit vDOM-Fehlern crashen lässt -->
      <div class="flex h-full items-start gap-4 overflow-x-auto pb-4" data-testid="ticket-board">
        <TicketBoardList
          v-for="(list, index) in lists"
          :key="list.$id"
          :list="list"
          :tickets="ticketsByList.get(list.$id) ?? []"
          :index="index"
          @open="open"
          @move-card="(ticketId, cardIndex) => onMoveCard(ticketId, list.$id, cardIndex)"
          @move-list="onMoveList"
          @refresh="refresh"
        />

        <div class="w-72 shrink-0">
          <form v-if="addingList" class="rounded-xl bg-elevated/60 p-2" @submit.prevent="addList">
            <UInput
              v-model="newListTitle"
              size="sm"
              autofocus
              :placeholder="t('tickets.board.listTitlePlaceholder')"
              class="w-full"
              @keydown.escape="addingList = false"
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
            @click="addingList = true"
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
    </template>
  </UDashboardPanel>
</template>

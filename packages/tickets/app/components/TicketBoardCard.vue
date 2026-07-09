<script setup lang="ts">
import type { TicketRow } from '../../shared/types/ticket'
import { parseTicketChecklist, parseTicketMembers } from '../utils/ticketMarkdown'

/** Kompakte Board-Karte — Badges für Label/Priorität/Fälligkeit/Checkliste/Mitglieder. */
const props = defineProps<{ ticket: TicketRow }>()

const { t } = useI18n()

const LABEL_META: Record<string, { color: 'info' | 'error' | 'neutral', icon: string }> = {
  idea: { color: 'info', icon: 'i-ph-lightbulb' },
  issue: { color: 'error', icon: 'i-ph-bug' },
  other: { color: 'neutral', icon: 'i-ph-chat-circle-dots' },
}
const PRIORITY_META: Record<string, { color: 'error' | 'warning' | 'neutral', icon: string }> = {
  high: { color: 'error', icon: 'i-ph-arrow-up' },
  medium: { color: 'warning', icon: 'i-ph-equals' },
  low: { color: 'neutral', icon: 'i-ph-arrow-down' },
}

const checklist = computed(() => parseTicketChecklist(props.ticket.checklist))
const checklistDone = computed(() => checklist.value.filter(item => item.done).length)
const members = computed(() => parseTicketMembers(props.ticket.membersJson))

const overdue = computed(() =>
  props.ticket.dueAt !== null && props.ticket.status !== 'done' && new Date(props.ticket.dueAt) < new Date())

function initials(name: string): string {
  return name.split(/\s+/).map(part => part[0] ?? '').join('').slice(0, 2).toUpperCase()
}
</script>

<template>
  <div
    class="group cursor-pointer rounded-lg border border-default bg-default p-3 shadow-xs transition hover:border-primary/50"
    :data-ticket="ticket.$id"
  >
    <div class="flex items-start gap-2">
      <UIcon
        v-if="ticket.status === 'done'"
        name="i-ph-check-circle-fill"
        class="mt-0.5 size-4 shrink-0 text-success"
        :aria-label="t('tickets.card.done')"
      />
      <p class="min-w-0 flex-1 text-sm" :class="ticket.status === 'done' ? 'text-muted line-through' : ''">
        {{ ticket.title }}
      </p>
    </div>

    <div v-if="ticket.label || ticket.priority || ticket.dueAt || checklist.length || members.length" class="mt-2 flex flex-wrap items-center gap-1.5">
      <UBadge v-if="ticket.label" :color="LABEL_META[ticket.label]?.color" variant="subtle" size="sm" :icon="LABEL_META[ticket.label]?.icon">
        {{ t(`tickets.labels.${ticket.label}`) }}
      </UBadge>
      <UBadge v-if="ticket.priority" :color="PRIORITY_META[ticket.priority]?.color" variant="subtle" size="sm" :icon="PRIORITY_META[ticket.priority]?.icon">
        {{ t(`tickets.priorities.${ticket.priority}`) }}
      </UBadge>
      <UBadge v-if="ticket.dueAt" :color="overdue ? 'error' : 'neutral'" :variant="overdue ? 'solid' : 'subtle'" size="sm" icon="i-ph-clock">
        {{ new Date(ticket.dueAt).toLocaleDateString() }}
      </UBadge>
      <UBadge v-if="checklist.length" :color="checklistDone === checklist.length ? 'success' : 'neutral'" variant="subtle" size="sm" icon="i-ph-check-square">
        {{ checklistDone }}/{{ checklist.length }}
      </UBadge>
      <span v-if="members.length" class="ms-auto flex -space-x-1.5">
        <span
          v-for="member in members.slice(0, 3)"
          :key="member.id"
          class="flex size-5 items-center justify-center rounded-full bg-elevated text-[9px] font-semibold ring-1 ring-default"
          :title="member.name"
        >
          {{ initials(member.name) }}
        </span>
      </span>
    </div>
  </div>
</template>

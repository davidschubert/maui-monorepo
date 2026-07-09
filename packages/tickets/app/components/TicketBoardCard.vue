<script setup lang="ts">
import type { TicketRow } from '../../shared/types/ticket'
import { parseTicketChecklist, parseTicketMembers } from '../utils/ticketMarkdown'
import { TICKET_LABEL_META, TICKET_PRIORITY_META } from '../utils/ticketMeta'

/**
 * Board-Karte — Reihenfolge nach Vorgabe: Label (oben links) + Edit-Icon
 * (oben rechts, bei Hover), Headline, Priorität, Datum (Bereich + Überfällig/
 * Bald fällig), Checkliste, Mitglieder als gestackte AvatarGroup (max 3, +x).
 */
const props = defineProps<{ ticket: TicketRow }>()
const emit = defineEmits<{ open: [] }>()

const { t, locale } = useI18n()
const { avatarById } = useTicketAssignable()

const checklist = computed(() => parseTicketChecklist(props.ticket.checklist))
const checklistDone = computed(() => checklist.value.filter(item => item.done).length)
const members = computed(() => parseTicketMembers(props.ticket.membersJson))

const HOURS_48 = 48 * 60 * 60 * 1000
const dueState = computed<'overdue' | 'soon' | null>(() => {
  if (!props.ticket.dueAt || props.ticket.status === 'done') return null
  const diff = new Date(props.ticket.dueAt).getTime() - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < HOURS_48) return 'soon'
  return null
})

/** „8. Juli" bzw. „7. Juli – 8. Juli, 16:53" (Start + Fälligkeit) */
const dateText = computed(() => {
  const due = props.ticket.dueAt
  if (!due) return null
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale.value, { day: 'numeric', month: 'long' })
  const time = new Date(due).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' })
  if (props.ticket.startAt) return `${day(props.ticket.startAt)} – ${day(due)}, ${time}`
  return day(due)
})
</script>

<template>
  <div
    class="group cursor-pointer rounded-lg border border-default bg-default p-3 shadow-xs transition hover:border-primary/50"
    :data-ticket="ticket.$id"
    @click="emit('open')"
  >
    <div class="flex items-start justify-between gap-2">
      <UBadge
        v-if="ticket.label"
        :color="TICKET_LABEL_META[ticket.label]?.color"
        variant="subtle"
        size="sm"
        :icon="TICKET_LABEL_META[ticket.label]?.icon"
      >
        {{ t(`tickets.labels.${ticket.label}`) }}
      </UBadge>
      <UIcon
        v-else-if="ticket.status === 'done'"
        name="i-ph-check-circle-fill"
        class="mt-0.5 size-4 text-success"
        :aria-label="t('tickets.card.done')"
      />
      <span v-else />
      <UButton
        icon="i-ph-pencil-simple"
        color="neutral"
        variant="ghost"
        size="xs"
        class="opacity-0 transition group-hover:opacity-100"
        :aria-label="t('tickets.card.edit')"
        data-testid="card-edit"
        @click.stop="emit('open')"
      />
    </div>

    <p class="mt-1.5 flex items-start gap-1.5 text-sm" :class="ticket.status === 'done' ? 'text-muted line-through' : ''">
      <UIcon
        v-if="ticket.label && ticket.status === 'done'"
        name="i-ph-check-circle-fill"
        class="mt-0.5 size-4 shrink-0 text-success"
        :aria-label="t('tickets.card.done')"
      />
      {{ ticket.title }}
    </p>

    <div v-if="ticket.priority" class="mt-2">
      <UBadge
        :color="TICKET_PRIORITY_META[ticket.priority]?.color"
        variant="subtle"
        size="sm"
        :icon="TICKET_PRIORITY_META[ticket.priority]?.icon"
      >
        {{ t(`tickets.priorities.${ticket.priority}`) }}
      </UBadge>
    </div>

    <div v-if="dateText" class="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <UIcon name="i-ph-clock" class="size-3.5" />
      <span>{{ dateText }}</span>
      <UBadge v-if="dueState === 'overdue'" color="error" variant="solid" size="sm">
        {{ t('tickets.card.overdue') }}
      </UBadge>
      <UBadge v-else-if="dueState === 'soon'" color="warning" variant="subtle" size="sm">
        {{ t('tickets.card.dueSoon') }}
      </UBadge>
    </div>

    <div v-if="checklist.length" class="mt-2">
      <UBadge
        :color="checklistDone === checklist.length ? 'success' : 'neutral'"
        variant="subtle"
        size="sm"
        icon="i-ph-check-square"
      >
        {{ checklistDone }}/{{ checklist.length }}
      </UBadge>
    </div>

    <UAvatarGroup v-if="members.length" size="xs" :max="3" class="mt-2.5">
      <UAvatar
        v-for="member in members"
        :key="member.id"
        :src="avatarById.get(member.id)"
        :alt="member.name"
        :title="member.name"
      />
    </UAvatarGroup>
  </div>
</template>

<script setup lang="ts">
import type { TicketRow } from '../../shared/types/ticket'

/**
 * Platzhalter für den Kommentarbereich im Ticket-Modal (rechte Spalte,
 * Trello-Muster „Kommentare und Aktivität"). Der tickets-Layer kennt den
 * comments-Layer NICHT (A14) — die APP überschreibt diese Komponente und
 * füllt sie mit ihrer CommentSection (targetType 'ticket'; der comments-
 * Layer behandelt das als Operator-Target). Ohne Override: dezenter Hinweis.
 */
defineProps<{ ticket: TicketRow }>()

const { t } = useI18n()
</script>

<template>
  <p class="text-sm text-muted">{{ t('tickets.comments.notWired') }}</p>
</template>

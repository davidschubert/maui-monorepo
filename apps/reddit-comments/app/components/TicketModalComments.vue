<script setup lang="ts">
import type { TicketRow } from '../../../../packages/tickets/shared/types/ticket'

/**
 * App-Override des Ticket-Modal-Kommentarbereichs (A14: die App komponiert
 * tickets + comments): CommentSection mit targetType 'ticket' — der
 * comments-Layer behandelt das als Operator-Target (Rows nur für
 * admin/moderator lesbar, siehe maui.comments.operatorTargets).
 */
const props = defineProps<{ ticket: TicketRow }>()

const targetUrl = computed(() => `/dashboard/tickets?ticket=${props.ticket.$id}`)
</script>

<template>
  <CommentSection :target-id="ticket.$id" target-type="ticket" :target-url="targetUrl" />
</template>

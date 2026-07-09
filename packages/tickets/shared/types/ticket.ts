import type { Models } from 'node-appwrite'

export const TICKET_LISTS_TABLE = 'ticket_lists'
export const TICKETS_TABLE = 'tickets'
export const TICKET_WATCHERS_TABLE = 'ticket_watchers'
export const TICKET_FILES_TABLE = 'ticket_files'
export const TICKET_FILES_BUCKET = 'ticket-files'

export const TICKET_LABELS = ['idea', 'issue', 'other'] as const
export type TicketLabel = (typeof TICKET_LABELS)[number]

export const TICKET_PRIORITIES = ['low', 'medium', 'high'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_EFFORTS = ['easy', 'medium', 'hard', 'very_hard'] as const
export type TicketEffort = (typeof TICKET_EFFORTS)[number]

export const TICKET_SORTS = ['createdDesc', 'createdAsc', 'alpha'] as const
export type TicketSort = (typeof TICKET_SORTS)[number]

/** Checklisten-Eintrag (Spalte `checklist`, JSON-Array) */
export interface TicketChecklistItem {
  text: string
  done: boolean
}

/** Karten-Mitglied (Spalte `membersJson`, JSON-Array; nur Admins/Mods) */
export interface TicketMember {
  id: string
  name: string
  /** nur in der assignable-Antwort — wird NICHT in membersJson persistiert */
  avatarUrl?: string
}

export interface TicketListRow extends Models.Row {
  title: string
  position: number
}

export interface TicketRow extends Models.Row {
  listId: string
  title: string
  description: string
  /** '' = ohne Label */
  label: TicketLabel | ''
  priority: TicketPriority | ''
  effort: TicketEffort | ''
  startAt: string | null
  dueAt: string | null
  /** JSON TicketChecklistItem[] — '' = keine */
  checklist: string
  /** JSON TicketMember[] — '' = keine */
  membersJson: string
  status: 'open' | 'done'
  doneAt: string | null
  position: number
  /** Herkunft Feedback-Ingestion (P2), '' = manuell angelegt */
  feedbackId: string
  createdBy: string
  createdByName: string
  /** Fälligkeits-Reminder verschickt (P4-Sweep, idempotent) */
  dueRemindedAt: string | null
}

export interface TicketWatcherRow extends Models.Row {
  ticketId: string
  userId: string
  userName: string
}

export interface TicketFileRow extends Models.Row {
  ticketId: string
  fileId: string
  name: string
  mimeType: string
  size: number
  uploadedBy: string
}

/** Antwort von GET /api/tickets/watching */
export interface TicketWatchingResponse {
  /** alle Ticket-Ids, die der aktuelle User beobachtet */
  ticketIds: string[]
  /** beobachtete Tickets inkl. Listen-Titel (für die Beobachtet-Ansicht) */
  tickets: (TicketRow & { listTitle: string })[]
}

/** Antwort von GET /api/tickets/board */
export interface TicketBoardResponse {
  lists: TicketListRow[]
  tickets: TicketRow[]
}

/** Antwort von GET /api/tickets/assignable */
export interface TicketAssignableResponse {
  users: TicketMember[]
}

import { z } from 'zod'
import { TICKET_EFFORTS, TICKET_LABELS, TICKET_PRIORITIES, TICKET_SORTS } from '../shared/types/ticket'

/**
 * Server-Validierung der Ticket-Routen (Zod, zentrale Limits passend zum
 * Spalten-Budget der Migration). Bewusst ohne t()-Factory: Operator-API,
 * Fehlertexte sind nicht user-facing (das UI validiert selbst minimal).
 */

const checklistSchema = z.array(z.object({
  text: z.string().trim().min(1).max(200),
  done: z.boolean(),
})).max(30)

const membersSchema = z.array(z.object({
  id: z.string().min(1).max(36),
  name: z.string().trim().min(1).max(100),
})).max(10)

export const ticketCreateSchema = z.object({
  listId: z.string().min(1).max(36),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10000).optional().default(''),
  label: z.enum(TICKET_LABELS).or(z.literal('')).optional().default(''),
  priority: z.enum(TICKET_PRIORITIES).or(z.literal('')).optional().default(''),
  effort: z.enum(TICKET_EFFORTS).or(z.literal('')).optional().default(''),
  startAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  dueAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  checklist: checklistSchema.optional().default([]),
  members: membersSchema.optional().default([]),
})

export const ticketPatchSchema = z.object({
  listId: z.string().min(1).max(36).optional(),
  position: z.number().finite().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  label: z.enum(TICKET_LABELS).or(z.literal('')).optional(),
  priority: z.enum(TICKET_PRIORITIES).or(z.literal('')).optional(),
  effort: z.enum(TICKET_EFFORTS).or(z.literal('')).optional(),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  checklist: checklistSchema.optional(),
  members: membersSchema.optional(),
  status: z.enum(['open', 'done']).optional(),
})

export const listCreateSchema = z.object({
  title: z.string().trim().min(1).max(100),
})

export const listPatchSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  position: z.number().finite().optional(),
})

export const listSortSchema = z.object({
  by: z.enum(TICKET_SORTS),
})

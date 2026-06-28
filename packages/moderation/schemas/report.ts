import { z } from 'zod'

/**
 * Server-Validierung für eine eingehende Meldung. targetType/reason bleiben
 * offene Strings (der Konsument definiert seinen Katalog) — nur Länge/Pflicht
 * werden hier erzwungen.
 */
export const createReportSchema = z.object({
  targetType: z.string().min(1).max(64),
  targetId: z.string().min(1).max(255),
  reason: z.string().min(1).max(64),
  note: z.string().max(2000).optional(),
})

export type CreateReportInput = z.infer<typeof createReportSchema>

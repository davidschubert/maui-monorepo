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

/**
 * Server-Validierung fürs Abschließen aller offenen Meldungen zu einem Target.
 * `resolution` bleibt ein offener, aber längenbegrenzter String (z. B. 'hidden',
 * 'no_action') — der Konsument bestimmt die Semantik.
 */
export const resolveReportSchema = z.object({
  targetType: z.string().min(1).max(64),
  targetId: z.string().min(1).max(255),
  resolution: z.string().min(1).max(64).default('no_action'),
})

export type ResolveReportInput = z.infer<typeof resolveReportSchema>

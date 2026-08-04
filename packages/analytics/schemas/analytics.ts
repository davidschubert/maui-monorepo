import { z } from 'zod'
import { ANALYTICS_SCRIPT_ID_RE } from '../../core/shared/analyticsScript'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/**
 * Die Einstellung der Community: GENAU ein Feld, und das ist eine Id, keine
 * Adresse (Begründung in core/shared/analyticsScript.ts).
 *
 * `.strict()`, damit ein zusätzliches Feld auffällt statt still zu
 * verschwinden — hier landen Kunden-Eingaben in einem `<script src>`.
 */
export function createAnalyticsSettingsSchema(t: TranslateFn = identity) {
  return z.object({
    plausibleScriptId: z.string().trim()
      .regex(ANALYTICS_SCRIPT_ID_RE, t('analytics.validation.scriptIdInvalid')),
  }).strict()
}

/** Server-seitige Instanz (Fehlertexte = Keys; die UI validiert mit t()). */
export const analyticsSettingsSchema = createAnalyticsSettingsSchema()

import { z } from 'zod'
import { ANALYTICS_SCRIPT_ID_RE } from '../../core/shared/analyticsScript'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/**
 * Die Einstellung der Community: ZWEI Felder, beide optional.
 *
 *  - `enabled` — der Schalter „Messung aktiv" (Sammel-Site, v2).
 *  - `plausibleScriptId` — die eigene Plausible-Site („Erweitert"): eine Id,
 *    keine Adresse (Begründung in core/shared/analyticsScript.ts).
 *
 * WARUM BEIDE OPTIONAL SIND — und das ist Betrieb, nicht Geschmack (dasselbe
 * Muster wie `communities.neutral` unter M13): ein PATCH schickt nur, was er
 * ändert; ein FEHLENDES Feld heißt „nicht angefasst", nie „zurück auf leer".
 * Wäre eines Pflicht, überschriebe jeder Klick auf den Schalter aus einem noch
 * ausgelieferten alten Client-Bundle die eigene Script-Id mit '' — und beim
 * Deploy laufen alte und neue Seiten für ein paar Minuten nebeneinander.
 *
 * `.refine`, damit ein LEERER Body auffällt: er täte still nichts und meldete
 * dem Owner trotzdem „Gespeichert".
 *
 * `.strict()`, damit ein zusätzliches Feld auffällt statt still zu
 * verschwinden — hier landen Kunden-Eingaben in einem `<script src>`.
 */
export function createAnalyticsSettingsSchema(t: TranslateFn = identity) {
  return z.object({
    plausibleScriptId: z.string().trim()
      .regex(ANALYTICS_SCRIPT_ID_RE, t('analytics.validation.scriptIdInvalid'))
      .optional(),
    enabled: z.boolean().optional(),
  }).strict().refine(
    body => body.plausibleScriptId !== undefined || body.enabled !== undefined,
    { message: t('analytics.validation.nothingToSave') },
  )
}

/** Server-seitige Instanz (Fehlertexte = Keys; die UI validiert mit t()). */
export const analyticsSettingsSchema = createAnalyticsSettingsSchema()

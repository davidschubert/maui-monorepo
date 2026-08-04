import { z } from 'zod'
import { TOPIC_STATE_FIELDS } from '../shared/topicState'

/**
 * Ein Zustand eines Themas wird gesetzt (F1 Stufe 3).
 *
 * EIN Feld je Aufruf, kein Sammel-PATCH mit drei optionalen Feldern. Grund:
 * die Rechte sind je Feld VERSCHIEDEN (anheften/schließen = Moderation,
 * „gelöst" auch der Autor). Ein Sammel-Body müsste die Prüfung pro Feld
 * wiederholen und im Teilfehler entscheiden, ob er die Hälfte schreibt — eine
 * Frage, die sich bei einem Feld je Aufruf gar nicht erst stellt.
 *
 * `value` ist PFLICHT und kein Umschalter („toggle"): der Aufrufer sagt, welchen
 * Zustand er sehen will. Ein Umschalter würde bei zwei schnellen Klicks oder
 * einem wiederholten Request das Gegenteil bewirken — dieselbe Überlegung, aus
 * der Stimmen-Routen ihren Wert mitschicken statt zu kippen.
 */
export function createTopicStateSchema() {
  return z.object({
    field: z.enum(TOPIC_STATE_FIELDS),
    value: z.boolean(),
  }).strict()
}

export const topicStateSchema = createTopicStateSchema()

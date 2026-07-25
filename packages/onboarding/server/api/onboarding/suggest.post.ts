import { z } from 'zod'
import { SITE_CATEGORIES, SITE_DESCRIPTION_MAX, SITE_MEMBER_RANGES } from '../../../../studio/shared/onboarding'

/**
 * KI-VORSCHLAG für die Beschreibung (Schritt 4) — Davids Entscheidung
 * 2026-07-24: optionaler Knopf, der Mensch entscheidet.
 *
 * Bewusst advisory wie der Moderations-Assist: die Antwort landet als
 * EDITIERBARER Text im Feld, nie direkt auf der Seite der Community. Ohne
 * KI-Key gibt es die Route nicht (404) — dann fehlt im UI einfach der Knopf,
 * statt dass ein Klick ins Leere läuft.
 */
const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(SITE_CATEGORIES),
  memberRange: z.enum(SITE_MEMBER_RANGES),
  locale: z.enum(['de', 'en']).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  if (!isAiAvailable(event)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  const body = await readValidatedBody(event, bodySchema.parse)
  const german = (body.locale ?? 'de') === 'de'

  const suggestion = await aiComplete(event, [
    german
      ? `Community-Name: ${body.name}`
      : `Community name: ${body.name}`,
    german ? `Kategorie: ${body.category}` : `Category: ${body.category}`,
    german ? `Ungefähre Größe: ${body.memberRange}` : `Approximate size: ${body.memberRange}`,
  ].join('\n'), {
    label: 'onboarding-description',
    // Kurz, konkret, ohne Marketing-Sprache — ein Vorschlag, den man behalten
    // KANN, nicht einer, den man erst entschwurbeln muss.
    system: german
      ? 'Du hilfst beim Einrichten einer Community. Schreibe 2 kurze Sätze (maximal 320 Zeichen) darüber, WEN diese Community zusammenbringt und WOFÜR. Schreibe schlicht und konkret, in der Wir-Form, ohne Superlative, ohne Marketing-Floskeln, ohne Emojis, ohne Anführungszeichen. Antworte nur mit dem Text.'
      : 'You help someone set up a community. Write 2 short sentences (max 320 characters) about WHO this community brings together and WHAT FOR. Plain and concrete, first-person plural, no superlatives, no marketing speak, no emojis, no quotes. Reply with the text only.',
    temperature: 0.5,
    maxTokens: 200,
  })

  // Klemmen beim Konsumenten (Transport ist policy-frei): niemals mehr
  // zurückgeben, als das Feld annimmt.
  return { suggestion: suggestion.trim().slice(0, SITE_DESCRIPTION_MAX) }
})

import { z } from 'zod'
import { BLOCK_SCOPES, MAX_MESSAGE_BODY } from '../shared/types/message'
import { MESSAGE_REPORT_REASONS } from '../shared/messageReport'

/**
 * Zod-Schemata der Nachrichten-Routen. Als `create*Schema(t)`-Fabriken, damit
 * die Meldungen lokalisiert sind (Projektregel) — die Server-Routen rufen sie
 * mit einer Identität, die Oberfläche mit `t`.
 *
 * KEIN `communityId`, KEIN `conversationId` im Body: den Mandanten setzt die
 * Datentür (`stripTenantKey` entfernt ihn ohnehin), die Konversation steht im
 * Pfad. Ein Feld, das der Aufrufer setzen könnte, wäre hier eine Einladung.
 */
type Translate = (key: string, params?: Record<string, unknown>) => string

const identity: Translate = key => key

/** Der Nachrichtentext — dieselbe Grenze wie bei einem Beitrag. */
function bodyField(t: Translate) {
  return z.string()
    .trim()
    .min(1, t('messages.validation.bodyRequired'))
    .max(MAX_MESSAGE_BODY, t('messages.validation.bodyTooLong', { max: MAX_MESSAGE_BODY }))
}

/**
 * Eine Konversation eröffnen — angesprochen wird über den HANDLE, nicht über
 * eine User-Id.
 *
 * WARUM DER HANDLE UND NICHT DIE ID: Handles sind je Community eindeutig
 * (`core/shared/handles.ts`), sie sind das, was ein Mensch tippen kann, und
 * sie führen die Suche über eine Route, die ohnehin nur Mitgliedern antwortet
 * (`GET /api/handles/search`, Session-Client + Label). Eine rohe User-Id im
 * Body wäre ein Adressbuch für jeden, der Ids durchprobiert.
 */
export function createStartConversationSchema(t: Translate = identity) {
  return z.object({
    handle: z.string().trim().min(1, t('messages.validation.recipientRequired')).max(24),
    body: bodyField(t),
  })
}

/** Antworten in einer bestehenden Konversation. */
export function createReplySchema(t: Translate = identity) {
  return z.object({
    body: bodyField(t),
  })
}

/**
 * Sperren. `everywhere` ist Davids Häkchen aus Entscheidung 3 — es ändert die
 * REICHWEITE der einen Zeile, nicht ihre Anzahl (Begründung im Kopf von
 * `server/utils/messageBlocks.ts`).
 */
export function createBlockSchema(t: Translate = identity) {
  return z.object({
    userId: z.string().trim().min(1, t('messages.validation.recipientRequired')).max(64),
    everywhere: z.boolean().default(false),
  })
}

/** Der Owner-Schalter (Konzept § 2.6). */
export function createMessageSettingsSchema(_t: Translate = identity) {
  return z.object({
    enabled: z.boolean(),
  })
}

/** Melde-Gründe — der Katalog liegt pur bei der Snapshot-Regel. */
export const messageReportReasonSchema = z.enum(MESSAGE_REPORT_REASONS)

/** Sperr-Reichweiten als Schema (für die Migration/Validierung gespiegelt). */
export const blockScopeSchema = z.enum(BLOCK_SCOPES)

import { createBlockSchema } from '../../../../schemas/message'

/**
 * JEMANDEN SPERREN — beidseitig, ohne Auskunft (Konzept § 2.3).
 *
 * ── KEIN TL-GATE, KEIN OWNER-SCHALTER ────────────────────────────────────
 * Sich zu schützen darf an nichts hängen. Wer angeschrieben wurde, hat
 * womöglich Stufe 0 (Empfangen geht ab 0), und wenn ein Owner das Produkt
 * abschaltet, sollen bestehende Sperren trotzdem setzbar bleiben — schaltet er
 * es wieder ein, gelten sie sofort. Eine Schutzhandlung hinter einem
 * Produkt-Schalter wäre die Umkehrung des Zwecks.
 *
 * Das PRODUKT-Gate (Tarif) bleibt: ohne das Produkt gibt es keine Nachrichten
 * und damit nichts zu sperren.
 *
 * ── DAS HÄKCHEN „ÜBERALL" ────────────────────────────────────────────────
 * Davids Entscheidung 3. Es ändert die REICHWEITE der einen Zeile, nicht ihre
 * Anzahl — warum nicht N Zeilen geschrieben werden, steht im Kopf von
 * `server/utils/messageBlocks.ts` (die Liste der eigenen Communities lebt im
 * Control Plane, und eine morgen beigetretene Community bekäme ohnehin keine).
 */
export default defineEventHandler(async (event) => {
  requirePlanProduct(event, 'messages')

  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const body = await readValidatedBody(event, createBlockSchema().parse)
  if (body.userId === user.$id) {
    throw createError({ status: 400, statusText: 'You cannot block yourself' })
  }

  await blockUser(event, user.$id, body.userId, body.everywhere)
  return { ok: true }
})

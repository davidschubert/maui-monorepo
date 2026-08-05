import { Query } from 'node-appwrite'
import { z } from 'zod'
import { HANDLE_MAX_LENGTH, normalizeHandle } from '../../../shared/handles'
import { HANDLES_TABLE, type CommunityHandleRow } from '../../../shared/types/handle'

/** Kurze Liste — das Menü in der Schreibfläche zeigt ohnehin nur eine Handvoll. */
const LIMIT = 8

const querySchema = z.object({
  q: z.string().trim().max(HANDLE_MAX_LENGTH).optional(),
})

/**
 * Vorschläge für das Erwähnungs-Menü der Schreibfläche.
 *
 * ── DIE TÜRKLINKE IST HIER BEWUSST 'member' ────────────────────────────────
 * Anders als der Rest von core/server/utils/handles.ts (der den Admin-Client
 * braucht, weil die Tabelle keine Schreibrechte trägt) liest DIESE Route mit
 * dem Session-Client. Das ist kein Zufall: eine Liste ALLER Namen einer
 * Community ist ihre Mitgliederliste, und die soll nur sehen, wer dazugehört.
 * Die Zeilen tragen `read(label:<communityId>)` — wer das Label nicht hat,
 * bekommt von Appwrite nichts, ganz ohne eigene Prüfung hier. Der
 * Mandanten-Filter der Datentür bleibt das Netz darunter.
 *
 * `status: 'active'` filtert richtig: vorgeschlagen wird, wie jemand HEUTE
 * heisst. Frühere Namen lösen weiterhin auf (resolveHandleOwners), aber
 * niemand soll sie neu tippen.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) throw createError({ status: 401, statusText: 'Unauthorized' })

  const { q } = await getValidatedQuery(event, querySchema.parse)
  const prefix = normalizeHandle(q ?? '')

  const { rows } = await tenantDb(event).list<CommunityHandleRow>(HANDLES_TABLE, [
    Query.equal('status', 'active'),
    ...(prefix ? [Query.startsWith('handleLower', prefix)] : []),
    Query.orderAsc('handleLower'),
    Query.limit(LIMIT),
  ])

  // `id` UND `label` tragen denselben Wert: das Menü fügt den Handle als
  // gewöhnlichen Text ein, es gibt keine Id im Fliesstext (siehe
  // shared/mentions.ts). Ein Feld mit einer Nutzer-Id wäre hier ein
  // Datenleck ohne Zweck.
  return rows.map(row => ({ id: row.handle, label: row.handle }))
})

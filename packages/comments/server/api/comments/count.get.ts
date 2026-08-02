import { Query } from 'node-appwrite'
import { communityContentIsPublic } from '../../../../core/shared/communityAudience'
import { COMMENTS_TABLE } from '../../../shared/types/comment'

/**
 * E3 (Embed-Plan Task 15): öffentliche Kommentar-Anzahl EINES Targets für
 * „N Kommentare"-Links auf HOSTSEITEN — der einzige bewusst cross-origin
 * konsumierbare Read-Endpoint (CORS '*', ohne Credentials; embed.js füllt
 * damit data-pukalani-count-Elemente). Zählt wie der Listen-Header: alle
 * nicht-hidden Kommentare (deleted-Platzhalter inklusive). Microcache 30 s
 * (user-agnostisch, tenant-scoped) + Read-Rate-Bucket (rate-limit.ts).
 *
 * NUR IN ÖFFENTLICHEN COMMUNITIES (Audit-Befund 2026-08-01, F4-Muster).
 *
 * Seit C18 ist die Antwort nicht mehr für alle dieselbe: in einer Community mit
 * Publikum 'members' tragen die Zeilen `read(label:<communityId>)`, also SIEHT
 * ein Mitglied hier eine andere Zahl als ein Gast. Damit war der Microcache
 * kaputt — wer als erster fragt, prägt die Zahl für alle, und dieselbe Route
 * gibt sie mit `Access-Control-Allow-Origin: *` an jede fremde Seite weiter.
 *
 * Der Cache-Schlüssel ums Publikum zu erweitern wäre die kleinere Änderung und
 * die falsche: eine geschlossene Community soll ihre Zahlen gar nicht erst
 * cross-origin veröffentlichen — auch „hier stehen 47 Beiträge" ist eine
 * Auskunft über einen Raum, den man nicht betreten darf. Deshalb dieselbe
 * Antwort wie beim Gast-Kommentar (guest.post.ts): 404, ohne die Existenz zu
 * bestätigen. Die App selbst benutzt diese Route nicht — der Feed zählt über
 * `/api/comments/counts` (Mehrzahl, session-genau, ohne Cache und ohne CORS).
 *
 * Und weil die Route damit nur noch öffentliche Communities bedient, ist der
 * Cache wieder ehrlich user-agnostisch: dort trägt jede sichtbare Zeile
 * `read(any)`, Gast und Mitglied zählen dasselbe.
 */
const countCache = createMicrocache<number>(30_000)

export default defineEventHandler(async (event): Promise<{ count: number }> => {
  if (!communityContentIsPublic(useTenant(event))) {
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  // CORS bewusst offen: read-only, credential-frei, keine personenbezogene Antwort
  setHeader(event, 'Access-Control-Allow-Origin', '*')

  const query = getQuery(event)
  const targetId = String(query.targetId ?? '')
  const targetType = String(query.targetType ?? '')
  if (!targetId || targetId.length > 255 || !targetType || targetType.length > 64) {
    throw createError({ status: 400, statusText: 'targetId and targetType are required' })
  }

  const cacheKey = `${tenantCacheScope(event)}:${targetType}:${targetId}`
  const cached = countCache.get(cacheKey)
  if (cached !== undefined) return { count: cached }

  const count = await tenantDb(event).count(COMMENTS_TABLE, [
    Query.equal('targetId', targetId),
    Query.equal('targetType', targetType),
    Query.notEqual('status', 'hidden'),
  ]).catch(() => 0)

  countCache.set(cacheKey, count)
  return { count }
})

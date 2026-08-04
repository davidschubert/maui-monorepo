import { Query } from 'node-appwrite'
import { EVENTS_TABLE, type EventModerationResponse, type EventRow } from '../../../shared/types/event'

/**
 * Moderations-Sicht auf Termine (F15): die jüngsten SICHTBAREN und die
 * ausgeblendeten — plus die Anzahl offener Meldungen je Termin über den
 * generischen moderation-Vertrag (targetType 'event').
 *
 * WELCHE STATUS: published · hidden · cancelled. `draft` bleibt DRAUSSEN — ein
 * Entwurf ist für niemanden sichtbar, kann also niemanden stören und gehört der
 * Redaktion (`/dashboard/events` zeigt ihn). Abgesagte Termine sind dagegen
 * weiterhin öffentlich lesbar und damit ein legitimes Moderations-Ziel, auch wenn
 * das Ausblenden sie heute nicht erwischt (eventModerationPolicy.ts).
 *
 * WARUM NICHT NACH MELDUNGEN SORTIERT: die Queue zeigt bewusst die jüngsten
 * Termine und markiert die gemeldeten, statt nur gemeldete zu listen — dieselbe
 * Entscheidung wie in `posts/moderation.get.ts`. Eine reine Meldungs-Liste
 * verbirgt den Kontext, in dem ein Moderator urteilt.
 *
 * AUTORISIERUNG: `requireCommunityPermission(event, 'events.moderate')` — die
 * Capability des MODERATORS, nicht `events.manage` des Editors. Das `await` ist
 * Pflicht — ohne wäre der Gate fail-open.
 *
 * PRODUKT-GATE (P4) VOR der Autorisierung: enthält der Plan das Produkt nicht,
 * existiert es für diesen Mandanten gar nicht — 404 wie die Datentür, statt erst
 * zu prüfen, wer etwas moderieren darf, das es hier nicht gibt. Ausführliche
 * Begründung (und die Abgrenzung zur M13-Sperre) im Kopf von `[id]/hide.post.ts`.
 *
 * KEIN KI-ASSIST: posts bietet zu gemeldeten Beiträgen eine KI-Einschätzung an.
 * Für Termine ist die bewusst nicht gebaut — der Text eines Termins ist kurz und
 * die eigentliche Frage („findet das wirklich statt, ist der Ort echt?") kann ein
 * Sprachmodell nicht beantworten. Ein Assist, der nur die Beschreibung liest,
 * gäbe eine Sicherheit vor, die er nicht hat. Deshalb trägt
 * `EventModerationResponse` auch kein `aiAssist`-Feld.
 */
export default defineEventHandler(async (event): Promise<EventModerationResponse> => {
  requirePlanProduct(event, 'events')
  await requireCommunityPermission(event, 'events.moderate')

  // Datentür als Operator: die Moderation sieht auch ausgeblendete Termine (die
  // tragen kein Leserecht mehr) — aber nur die des EIGENEN Mandanten. Der
  // Admin-Client umgeht Row-Permissions, die Tür ist hier die einzige Grenze.
  const res = await tenantDb(event, { as: 'operator' }).list<EventRow>(EVENTS_TABLE, [
    Query.equal('status', ['published', 'hidden', 'cancelled']),
    Query.orderDesc('$createdAt'),
    Query.limit(50),
  ]).catch((error) => { throw toH3Error(error, 'Could not load events') })

  const reports = await openReportsByTarget(event, 'event')

  return {
    rows: res.rows,
    reportCounts: Object.fromEntries(reports.counts),
  }
})

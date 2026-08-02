import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import {
  type NotificationAudience,
  notificationAudienceFor,
  visibleNotificationScopes,
} from '../../shared/notificationScope'
import { useTenant } from './tenant'

/**
 * Server-Hälfte der Notification-Ablage (C15). Die Regel selbst ist pure und
 * liegt in shared/notificationScope.ts — hier kommt nur der Request-Kontext
 * dazu.
 *
 * WARUM NICHT `tenantDb`: die Datentür kann diese Fälle nicht ausdrücken. Sie
 * filtert im Pool auf GENAU eine tenantId (`scopeQuery`) und wertet fehlende
 * Stempel fail-closed — beides ist hier bewusst anders (Bestandszeilen bleiben
 * sichtbar, der Kundenbereich filtert auf einen Sentinel). Und sie könnte den
 * Kontroll-Host gar nicht bedienen: dort ist `tenant` null, die Tür scopt also
 * überhaupt nicht.
 */

/**
 * Das Publikum dieses Requests. `controlCenter` setzt 00.tenant.ts auf den
 * Kontroll-Hosts (Kundenbereich) — das ist das einzige Signal, das den
 * Kundenbereich vom Silo unterscheidet (in beiden ist `tenant` null).
 */
export function notificationAudience(event: H3Event): NotificationAudience {
  const tenant = useTenant(event)
  const tenantId = tenant?.mode === 'pool' ? tenant.tenantId : null
  return notificationAudienceFor(tenantId, event.context.controlCenter === true)
}

/** Der Mandanten-Filter für Notification-Abfragen; leer im Silo. */
export function notificationScopeQueries(event: H3Event): string[] {
  const allowed = visibleNotificationScopes(notificationAudience(event))
  // Query.equal mit Array = IN — eine Abfrage für „eigene Community ODER
  // ungestempelter Bestand" bzw. „Kundenbereich ODER Bestand".
  // E8-3: die Spalte heißt communityId (system-025/026).
  return allowed ? [Query.equal('communityId', allowed)] : []
}

/**
 * Kennt diese Instanz die Scope-Spalte NOCH NICHT? PURE (unit-getestet).
 *
 * Appwrite lehnt eine Query auf eine unbekannte Spalte mit 400 und dem Typ
 * `general_query_invalid` ab („Invalid query: Attribute not found in schema:
 * communityId"). Genau DAS ist der Deploy-Fall — und nur der.
 *
 * Bewusst eng: `code === 400` UND ein passendes Merkmal. Ein Timeout, ein
 * Appwrite-5xx oder ein abgerissener Socket tragen weder das eine noch das
 * andere und fallen deshalb nicht mehr in den Rückfall.
 */
export function isUnknownScopeColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, type, message } = error as { code?: unknown, type?: unknown, message?: unknown }
  if (code !== 400) return false
  if (type === 'general_query_invalid') return true
  const text = typeof message === 'string' ? message.toLowerCase() : ''
  // Fallback auf den Text, falls Appwrite den Typ je umbenennt — aber nur
  // zusammen mit dem 400er oben.
  return text.includes('attribute not found') || text.includes('unknown attribute')
}

/**
 * Eine Notification-Abfrage GESCOPT ausführen — und NUR bei einer noch nicht
 * migrierten Spalte einmal ungescopt wiederholen.
 *
 * WARUM ES DEN RÜCKFALL ÜBERHAUPT GIBT: die Scope-Spalte kommt mit einer
 * Migration (system-022, seit E8-3 heißt sie `communityId`, system-025), der
 * Code hier kommt mit dem Deploy. Läuft der Code vor der Migration, antwortet
 * Appwrite auf den Filter mit „attribute not found" — ohne Rückfall wäre die
 * Glocke bis zur Migration LEER. Eine kurz gemischte Glocke ist der Zustand
 * von gestern, eine leere ist neuer Schaden. Der Rückfall ist LAUT (warn),
 * damit er nicht zum Dauerzustand wird.
 *
 * WARUM ER SEIT DEM NACHT-AUDIT (2026-08-02, F34) ENG IST: vorher fing er
 * JEDEN Fehler. Ein Timeout oder ein Appwrite-5xx — also genau die Fehler, die
 * im Betrieb tatsächlich vorkommen — schaltete damit für die Dauer der Störung
 * die Mandanten-Trennung der Glocke ab und mischte fremde Communities hinein.
 * Ein Transportfehler ist kein Grund, eine Sicherheits-Grenze fallen zu
 * lassen: er fliegt jetzt durch, der Aufrufer bekommt seinen 5xx, und die
 * Glocke bleibt getrennt.
 *
 * NICHT GANZ ENTFERNT, obwohl die Migration überall gelaufen ist: die Brücke
 * kostet in diesem Zustand nichts (sie kann nur noch auf einer Instanz ohne
 * Migration feuern) und deckt denselben Fall bei der NÄCHSTEN Umbenennung der
 * Spalte wieder ab. Was sie nicht mehr darf, ist bei irgendetwas anderem
 * feuern.
 */
export async function runScopedNotificationQuery<T>(
  event: H3Event,
  run: (queries: string[]) => Promise<T>,
): Promise<T> {
  const queries = notificationScopeQueries(event)
  if (queries.length === 0) return await run(queries)
  try {
    return await run(queries)
  }
  catch (error) {
    if (!isUnknownScopeColumnError(error)) throw error
    console.warn('[core] Notification-Filter nach communityId fehlgeschlagen — Spalte fehlt, ungescopter Rückfall (Migration system-025 nicht gelaufen?):', error)
    return await run([])
  }
}

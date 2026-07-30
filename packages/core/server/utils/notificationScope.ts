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
  return allowed ? [Query.equal('tenantId', allowed)] : []
}

/**
 * Eine Notification-Abfrage GESCOPT ausführen — und bei einem Fehler EINMAL
 * ungescopt wiederholen.
 *
 * WARUM DER RÜCKFALL: die Spalte kommt mit system-022, der Code hier kommt mit
 * dem Deploy. Läuft der Code vor der Migration (oder auf einer Instanz, die sie
 * noch nicht hat), antwortet Appwrite auf den Filter mit „unknown attribute" —
 * ohne Rückfall wäre die Glocke bis zur Migration LEER. Das ist schlimmer als
 * der Befund, den wir hier reparieren: eine kurz gemischte Glocke ist der
 * Zustand von gestern, eine leere ist neuer Schaden. Der Rückfall ist LAUT
 * (warn), damit er nicht zum Dauerzustand wird.
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
    console.warn('[core] Notification-Filter nach tenantId fehlgeschlagen — ungescopter Rückfall (system-022 fehlt?):', error)
    return await run([])
  }
}

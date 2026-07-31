import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { OPERATOR_APEX } from '../../schemas/tenant'

/**
 * Die Betreiber-Zusatzliste gesperrter Subdomains (Tabelle aus control-027).
 *
 * Sie ergänzt die Code-Basisliste `RESERVED_SUBDOMAINS`, ersetzt sie NICHT: die
 * Zod-Schemas sind synchron und prüfen weiterhin nur den Code. Alles, was hier
 * steht, wirkt über diesen server-seitigen Nachschlag in den Anlege-Pfaden.
 */

export const RESERVED_NAMES_TABLE = 'reserved_names'

export interface ReservedNameRow extends Models.Row {
  /** Warum gesperrt — Freitext für den Betreiber; '' = ohne Begründung. */
  note: string
}

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

/**
 * Steht dieser Name in der Betreiber-Liste?
 *
 * Ein Schlüsselzugriff, weil der Name die Row-Id IST (control-027).
 *
 * FAIL-CLOSED, bewusst: nur ein 404 („gibt es nicht") heißt `false`. Jeder
 * andere Fehler — Appwrite weg, Zeitüberschreitung, Rechteproblem — wird
 * GEWORFEN und der Anlege-Pfad endet in einem 500. Die Alternative wäre
 * fail-soft (loggen und `false` zurückgeben), und die wäre hier fail-OPEN:
 * ausgerechnet in der Minute, in der die Datenbank hakt, ginge ein gesperrter
 * Name durch. Ein Mandant auf `presse.pukalani.app` ist dauerhaft; ein 500 beim
 * Anlegen ist ein Wiederholungsversuch.
 */
export async function isNameReservedInDb(event: H3Event, name: string): Promise<boolean> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  try {
    await admin.tablesDB.getRow<ReservedNameRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: RESERVED_NAMES_TABLE,
      rowId: name,
    })
    return true
  }
  catch (error) {
    if (hasCode(error, 404)) return false
    throw error
  }
}

/**
 * Welches Label eines Hosts entscheidet über die Sperre — oder `null`, wenn der
 * Host gar nicht unter der Betreiber-Domain liegt.
 *
 * Dieselbe Rechnung wie `isReservedHost`: die ERSTE Ebene unter dem Apex zählt,
 * damit auch `foo.functions.pukalani.app` an `functions` hängen bleibt. Fremde
 * Kundendomains (www.kunde.de) sind frei — dort hat der Betreiber nichts zu
 * sperren.
 *
 * Der nackte Apex ergibt `null`: dort gibt es kein Label, und er ist über
 * `isReservedHost` ohnehin unbedingt gesperrt — ein Nachschlag in der Tabelle
 * könnte daran nichts ändern.
 */
export function reservedFirstLabel(host: string): string | null {
  if (!host.endsWith(`.${OPERATOR_APEX}`)) return null
  const sub = host.slice(0, -(OPERATOR_APEX.length + 1))
  return sub.split('.').at(-1) ?? null
}

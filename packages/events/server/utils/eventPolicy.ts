import type { H3Event } from 'h3'

/**
 * WARTUNGSMODUS — im events-Layer war er schlicht nicht verdrahtet
 * (Audit-Befund vom 2026-08-02).
 *
 * `app_config.maintenanceMode` friert die Community ein: comments prüft ihn
 * seit jeher (commentPolicy.ts), posts an allen fünf Mitglieds-Schreibwegen
 * (S10b). events an keinem einzigen. Wer den Schalter umlegte, um an den Daten
 * zu arbeiten, sah Kommentare und Beiträge stillstehen — während Termine
 * angelegt, bearbeitet, abgesagt, bebildert, zu- und abgesagt und bewertet
 * wurden. Ein Wartungsmodus mit offener Hintertür ist keiner.
 *
 * EIGENE FUNKTION statt der aus comments: A14 — ein Produkt-Layer darf einen
 * anderen nicht kennen. In apps/platform und apps/comments liegen beide, ein
 * Import ginge also „zufällig" gut und bräche in einer Silo-App ohne comments.
 * Auch der NAME ist bewusst ein anderer (`assertEventsWritable` statt
 * `assertNotMaintenance`): zwei gleichnamige Auto-Imports in `server/utils`
 * zweier Layer kollidieren, und welcher gewinnt, entscheidet die
 * Layer-Reihenfolge — nicht die Absicht.
 *
 * 403 mit `data.code`, wie comments: der zentrale Fehler-Handler hebt den
 * Schlüssel als `reason` ins Envelope, die Oberfläche macht daraus einen Satz.
 *
 * WAS NICHT EINFRIERT und warum:
 *  - LESEN. Der Wartungsmodus soll die Community einfrieren, nicht abschalten
 *    (dieselbe Grenze wie in posts).
 *  - Der Reminder-Sweep (`reminder-sweep.post.ts` und der on-read-Zweig): das
 *    ist kein Mitglieds-Schreibweg, sondern ein Betreiber-Vorgang mit
 *    Schlüssel. Er schreibt einen Versand-Merker auf fremde Zeilen — eine
 *    verschluckte Terminerinnerung wäre der falsche Preis für eine Wartung.
 *
 * ABGRENZUNG zur M13-SPERRE: die billing-Sperre (Zahlungsverzug) lässt das
 * ABSAGEN bewusst offen — sie schützt die Zusagenden vor der Rechnung ihres
 * Owners (Begründung in `[id].delete.ts`). Hier gilt diese Ausnahme NICHT: den
 * Wartungsmodus legt der Betreiber selbst um, er weiß also von ihm und kann ihn
 * beenden. posts und comments frieren ihr Löschen ebenso ein.
 */
export async function assertEventsWritable(event: H3Event): Promise<void> {
  const config = await getAppConfig(event)
  if (config.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Service is in maintenance mode', data: { code: 'maintenance' } })
  }
}

import type { H3Event } from 'h3'
import { coverReadPermissions } from '../../shared/coverAudience'
import { EVENT_COVERS_BUCKET, type EventRow } from '../../shared/types/event'

/**
 * SICHTBARKEIT DER TITELBILDER — die zweite Seite desselben Schutzes.
 *
 * DER BEFUND (2026-08-02, C18-Lüge): der Bucket `event-covers` wurde in
 * Migration events-002 bucket-weit `read("any")` mit `fileSecurity: false`
 * angelegt. Stellt eine Community auf „nur für Mitglieder", zieht der
 * C18-Bestands-Umzug die Event-ROWS brav auf `read(label:<communityId>)` und
 * meldet `complete: true` — jedes Titelbild blieb per Roh-URL für die ganze
 * Welt abrufbar. Genau der Fall, den core an audienceRepermission.ts benennt
 * („ein Bild, dessen Row zu ist, dessen Datei aber offen, wäre kein Schutz")
 * und den media-002 für die Galerie schon geschlossen hat.
 *
 * DIE REGEL steht PURE in `shared/coverAudience.ts` (eine Zeile, drei Leser:
 * Laufzeit, Migration, Live-Beweis): **ein Cover ist nie offener als sein
 * Termin.** Die Datei bekommt die READ-Permissions ihrer Row — auch dann, wenn
 * das keine sind.
 *
 * DER ENTWURFS-REST IST SEIT F28 (2026-08-02) WEG. events-009 ließ ein Cover
 * ohne Row-Leserecht auf das MITGLIEDER-Publikum zurückfallen, weil die
 * Vorschau im Dashboard die Datei direkt aus dem Bucket holte und „niemand"
 * dort ein kaputtes Bild bedeutet hätte. Das war deutlich enger als vorher
 * (jede/r im Internet), aber immer noch offener als die Zeile: jedes Mitglied
 * konnte das Titelbild eines unveröffentlichten Termins per Roh-URL sehen. Die
 * Vorschau läuft jetzt über `GET /api/events/:id/cover` — server-seitig, hinter
 * `events.manage` und der Datentür —, also gibt es für die Ausnahme keinen
 * Grund mehr. Nachgezogen wird der Bestand von Migration events-010.
 *
 * KEIN `H3Event` MEHR (F28): solange Entwürfe auf das Publikum der Community
 * zurückfielen, brauchte die Rechnung den Request (`tenantRowPermissions`).
 * Jetzt hängt sie an NICHTS außer der Row — und ein Parameter, den niemand
 * liest, ist eine Einladung, doch wieder Request-Wissen hineinzuziehen.
 */
export function eventCoverPermissions(row: Pick<EventRow, '$permissions'>): string[] {
  return coverReadPermissions(row.$permissions)
}

/**
 * Das Leserecht der DATEI dem der Row angleichen.
 *
 * Aufrufer sind die Wege, an denen sich das Publikum der Row ändert:
 * Publizieren/Zurückziehen (auch die Serien-Propagation) und der Upload
 * selbst. Der C18-Massen-Umzug läuft NICHT hier durch, sondern über die
 * Registry (`server/plugins/audience-repermission.ts`) — core setzt Row und
 * Datei dort in einem Zug.
 *
 * BEST-EFFORT MIT LAUTEM LOG (Muster media applyMediaVisibility, Zwei-Phasen-
 * Hide): der Aufrufer hat seine eigentliche Aussage (Publizieren) schon
 * getroffen; sie deshalb zurückzurollen wäre schlimmer als ein Bild, das eine
 * Runde hinterherhinkt. Aber still darf es nicht bleiben — beim ZURÜCKZIEHEN
 * ist die Datei die offene Seite, und niemand sieht das von außen. Ein
 * erneutes Speichern heilt es (der Patch ist idempotent).
 */
export async function applyEventCoverVisibility(
  event: H3Event,
  row: Pick<EventRow, '$id' | '$permissions' | 'coverFileId'>,
): Promise<void> {
  if (!row.coverFileId) return
  const permissions = eventCoverPermissions(row)
  const set = () => createAdminClient(event).storage.updateFile({
    bucketId: EVENT_COVERS_BUCKET, fileId: row.coverFileId!, permissions,
  })
  await set().catch(() => set()).catch((error) => {
    console.error(
      `[events] Titelbild folgt dem Termin NICHT — Event ${row.$id}, Datei ${row.coverFileId}. `
      + 'Die Datei bleibt mit ihrem alten Publikum abrufbar, bis erneut gespeichert wird:',
      error,
    )
  })
}

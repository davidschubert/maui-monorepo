import type { H3Event } from 'h3'
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
 * DIE REGEL, in einem Satz: **ein Cover ist nie offener als sein Termin.**
 * Die Datei bekommt die READ-Permissions ihrer Row. Trägt die Row keine
 * (Entwurf), fällt das Bild auf das MITGLIEDER-Publikum der Community zurück —
 * nicht auf „niemand".
 *
 * Warum Entwürfe nicht ganz zu sind: das Dashboard zeigt beim Bearbeiten eine
 * Vorschau, und die holt der BROWSER direkt aus dem Bucket (nicht über den
 * Admin-Client). „Niemand" hieße hier ein kaputtes Bild für genau die Person,
 * die den Termin gerade anlegt. `events.manage` trägt im Pool die Rolle
 * `editor`, und die hat KEIN Moderations-Label (`mod<communityId>` hängt an
 * `reports.moderate`) — ein Manager-Read wie in media (`label('admin')`) wäre
 * dort also wirkungslos und ließe die Redaktion vor Platzhaltern sitzen.
 * Das Mitglieder-Publikum ist die engste Grenze, die die Vorschau überlebt,
 * und gegenüber heute (jede/r im Internet) eine deutliche Verengung. Die
 * saubere Lösung bleibt eine server-seitige Vorschau-Route für Entwurfs-
 * dateien — dieselbe offene Stelle, die mediaPermissions.ts notiert.
 */
export function eventCoverPermissions(event: H3Event, row: Pick<EventRow, '$permissions'>): string[] {
  // Die READ-Einträge der Row sind die Wahrheit — nicht `status`. Ein
  // abgesagter Termin behält sein Publikum, und C18 kann das Publikum jederzeit
  // umgezogen haben, ohne dass sich der Status geändert hätte.
  const reads = (row.$permissions ?? []).filter(permission => permission.startsWith('read('))
  if (reads.length > 0) return reads
  return tenantRowPermissions(event, { read: 'members' })
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
  const permissions = eventCoverPermissions(event, row)
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

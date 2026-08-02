import { Permission, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { MEDIA_BUCKET, MEDIA_TABLE } from '../../shared/types/media'

/**
 * Sichtbarkeit der Medien-Galerie — EIN Muster mit events: die Table trägt
 * keine breite Read-Permission mehr, das Leserecht hängt an der ROW und folgt
 * `published`.
 *
 * Zwei Seiten, ein Schutz: die Row UND die Datei im Bucket. Ein Entwurf,
 * dessen Bild man mit der fileId trotzdem abrufen kann, ist nicht geschützt —
 * deshalb ist `media` seit Migration media-002 ein fileSecurity-Bucket ohne
 * Bucket-weites read(any).
 *
 * C18 (2026-07-30): die Veröffentlichungs-Permission ist keine Konstante mehr —
 * was „veröffentlicht" heißt, entscheidet die Community (`read("any")`
 * öffentlich, `read("label:<communityId>")` geschlossen). `mediaPermissionsFor()`
 * braucht deshalb den Request. Beide Seiten (Row und Datei) folgen weiterhin
 * DEMSELBEN Array — ein Bild, dessen Row zu ist, dessen Datei aber offen, wäre
 * kein Schutz.
 */

/**
 * Entwürfe bleiben für die VERWALTENDEN lesbar — sonst zeigt die
 * Verwaltungs-Galerie (/dashboard/media) kaputte Bilder: der Browser holt die
 * Datei direkt aus dem Bucket, nicht über den Admin-Client.
 * `media.manage` liegt im Operator-RBAC allein bei `admin` (authz.ts), also
 * genau ein Label (Muster comments guest_authors / tickets).
 *
 * POOL-HINWEIS (C1b): das ist ein GLOBALES Operator-Label, kein Site-Label —
 * im Pool trägt es nur der Betreiber, nicht die Redaktion einer Kunden-Site.
 * Cross-Tenant ist das die enge Seite (kein Kunde sieht fremde Entwürfe), aber
 * die eigene Redaktion sähe im Pool in /dashboard/media kaputte Entwurfs-Bilder.
 * Das ist KEIN Datenleck und deshalb bewusst NICHT hier geflickt: ein
 * Site-Label (Role.label(communityId)) würde Entwürfe allen MITGLIEDERN der Site
 * öffnen — die richtige Lösung ist eine server-seitige Vorschau-Route für
 * Entwurfsdateien. Offen, bevor media in apps/platform gezogen wird.
 */
export const MEDIA_MANAGER_READ = [Permission.read(Role.label('admin'))]

/** Leserechte für einen Eintrag in genau EINEM Status — Row wie Datei. */
export function mediaPermissionsFor(event: H3Event, published: boolean): string[] {
  return published ? withPublishedRead(MEDIA_MANAGER_READ, event) : [...MEDIA_MANAGER_READ]
}

/**
 * Leserecht von Row + Datei dem `published`-Status angleichen.
 *
 * Reihenfolge ist Absicht: beim VERÖFFENTLICHEN zuerst die Datei (sonst zeigt
 * die bereits sichtbare Row für einen Moment auf ein 404-Bild), beim
 * ZURÜCKZIEHEN zuerst die Row (die Liste verschwindet, bevor das Bild geht).
 *
 * ZWEITE PHASE MUSS HALTEN (Audit-Befund 2026-08-01, Muster vom Zwei-Phasen-
 * Hide der Kommentare in commentModeration.ts): scheitert der zweite Schritt,
 * stehen Row und Datei verschieden — und in BEIDEN Richtungen ist die Datei die
 * offene Seite. Beim Zurückziehen sagt der Eintrag „Entwurf", während das Bild
 * per Roh-URL weiter abrufbar ist; beim Veröffentlichen ist die Datei schon
 * offen, während der Eintrag noch Entwurf ist. Deshalb EIN Retry (deckt
 * transiente Fehler) und danach ein LAUTES Log — ein zweiter Klick heilt es,
 * aber nur, wenn überhaupt jemand davon erfährt.
 *
 * Der Fehler fliegt trotzdem weiter (anders als beim Kommentar-Hide, wo die
 * erste Phase schon die Aussage des Vorgangs ist): die aufrufende Route meldet
 * ihn als Fehlschlag, statt einen halb entzogenen Schutz still zu verschweigen,
 * und ihr Patch ist idempotent — er legt die Sichtbarkeit auch dann erneut an,
 * wenn sich der Wert nicht geändert hat.
 *
 * DATENTÜR (C1b): die ROW geht über tenantDb — auch hier, obwohl die Aufrufer
 * ihre Row schon durch die Tür geholt haben. `server/utils` liegt AUSSERHALB
 * des ESLint-Backstops (der greift nur in server/api und server/plugins), und
 * genau in solchen Helfern sind zuletzt Lecks entstanden (grantEventTicket).
 * Ein Helfer, der einen H3Event bekommt, bedient einen Request — er prüft
 * selbst, statt einer früheren Prüfung zu vertrauen. Die DATEI im Bucket bleibt
 * Admin-Client: Files tragen keinen Mandanten, die Referenz (fileId) auf der
 * gestempelten Row tut es (Muster events-Cover).
 *
 * WER HANDELT: `actor: 'member'` — der einzige Aufrufer ist der
 * Veröffentlichen-Patch der Redaktion. Die Klinke bleibt 'operator', weil
 * media_items keine User-Schreibrechte trägt.
 */
export async function applyMediaVisibility(
  event: H3Event,
  row: { $id: string, fileId: string },
  published: boolean,
): Promise<void> {
  const admin = createAdminClient(event)
  const db = tenantDb(event, { as: 'operator', actor: 'member' })
  const permissions = mediaPermissionsFor(event, published)

  const setRow = () => db.updatePermissions(MEDIA_TABLE, row.$id, permissions, 'Media item not found')
  const setFile = () => admin.storage.updateFile({
    bucketId: MEDIA_BUCKET,
    fileId: row.fileId,
    permissions,
  })

  /**
   * Der ZWEITE Schritt bekommt einen Retry und ein lautes Log, der erste
   * bewusst nicht: scheitert der erste, ist noch nichts auseinandergelaufen —
   * der Fehler fliegt, der Zustand von vorher steht unverändert.
   */
  const secondPhase = (what: 'row' | 'file', run: () => Promise<unknown>): Promise<unknown> =>
    run().catch(() => run()).catch((error) => {
      console.error(
        `[media] Sichtbarkeit nur halb gesetzt — Eintrag ${row.$id} steht auf `
        + `${published ? 'veröffentlicht' : 'Entwurf'}, aber `
        + `${what === 'file' ? `Datei ${row.fileId}` : 'die Zeile'} folgt NICHT `
        + '(die Datei bleibt per Roh-URL abrufbar, bis erneut gespeichert wird):',
        error,
      )
      throw error
    })

  if (published) {
    await setFile()
    await secondPhase('row', setRow)
    return
  }
  await setRow()
  await secondPhase('file', setFile)
}

import { Permission, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { MEDIA_BUCKET, MEDIA_TABLE } from '../../shared/types/media'

/**
 * Sichtbarkeit der Medien-Galerie — EIN Muster mit events (EVENT_READ_ANY):
 * die Table trägt keine breite Read-Permission mehr, das Leserecht hängt an
 * der ROW und folgt `published`.
 *
 * Zwei Seiten, ein Schutz: die Row UND die Datei im Bucket. Ein Entwurf,
 * dessen Bild man mit der fileId trotzdem abrufen kann, ist nicht geschützt —
 * deshalb ist `media` seit Migration media-002 ein fileSecurity-Bucket ohne
 * Bucket-weites read(any).
 */
export const MEDIA_READ_ANY = Permission.read(Role.any())

/**
 * Entwürfe bleiben für die VERWALTENDEN lesbar — sonst zeigt die
 * Verwaltungs-Galerie (/dashboard/media) kaputte Bilder: der Browser holt die
 * Datei direkt aus dem Bucket, nicht über den Admin-Client.
 * `media.manage` liegt im Operator-RBAC allein bei `admin` (authz.ts), also
 * genau ein Label (Muster comments guest_authors / tickets).
 */
export const MEDIA_MANAGER_READ = [Permission.read(Role.label('admin'))]

/** Leserechte für einen Eintrag in genau EINEM Status — Row wie Datei. */
export function mediaPermissionsFor(published: boolean): string[] {
  return published ? [MEDIA_READ_ANY, ...MEDIA_MANAGER_READ] : [...MEDIA_MANAGER_READ]
}

/**
 * Leserecht von Row + Datei dem `published`-Status angleichen.
 *
 * Reihenfolge ist Absicht: beim VERÖFFENTLICHEN zuerst die Datei (sonst zeigt
 * die bereits sichtbare Row für einen Moment auf ein 404-Bild), beim
 * ZURÜCKZIEHEN zuerst die Row (die Liste verschwindet, bevor das Bild geht).
 *
 * Fehler werden bewusst durchgereicht — die aufrufende Route meldet sie als
 * Fehlschlag, statt einen halb entzogenen Schutz still zu verschweigen.
 */
export async function applyMediaVisibility(
  event: H3Event,
  row: { $id: string, fileId: string },
  published: boolean,
): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const permissions = mediaPermissionsFor(published)

  const setRow = () => admin.tablesDB.updateRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: MEDIA_TABLE,
    rowId: row.$id,
    permissions,
  })
  const setFile = () => admin.storage.updateFile({
    bucketId: MEDIA_BUCKET,
    fileId: row.fileId,
    permissions,
  })

  if (published) {
    await setFile()
    await setRow()
    return
  }
  await setRow()
  await setFile()
}

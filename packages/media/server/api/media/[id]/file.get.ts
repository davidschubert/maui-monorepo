import { ImageFormat } from 'node-appwrite'
import { MEDIA_BUCKET, MEDIA_TABLE, type MediaItem } from '../../../../shared/types/media'

/**
 * VORSCHAU EINES MEDIEN-EINTRAGS FÜR DIE REDAKTION (media.manage) — die
 * media-Hälfte von F28, fällig geworden mit dem Umzug in den Pool.
 *
 * WARUM ES DIESE ROUTE GIBT: die Datei eines ENTWURFS trägt seit media-002
 * genau das Leserecht ihrer Zeile, und das ist ein einziges GLOBALES
 * Operator-Label (`read(label:'admin')`, server/utils/mediaPermissions.ts).
 * Im Silo trägt der Betreiber es und die Vorschau in /dashboard/media lud
 * die Datei direkt aus dem Bucket. Im POOL trägt es NIEMAND aus der Community:
 * eine Redaktion mit der Rolle `editor` oder `owner` sähe ihre eigenen
 * Entwürfe als kaputte Bilder. Die falsche Antwort darauf wäre, der Datei
 * ersatzweise ein Site-Label zu geben — dann sähe jedes MITGLIED die
 * unveröffentlichten Bilder (genau der Befund, den events an derselben Stelle
 * hatte). Stattdessen holt der Server das Bild mit dem Admin-Client und gibt
 * es nur dem, der den Eintrag auch verwalten darf.
 *
 * ZWEI GRENZEN, BEIDE NÖTIG (Vorlage: /api/events/:id/cover):
 *  1. `requireCommunityPermission(event, 'media.manage')` — Site-Rolle vor
 *     protokolliertem Operator-Break-Glass. Das `await` ist Pflicht: ohne
 *     wäre der Gate fail-open.
 *  2. Die DATENTÜR als Operator. `get` belegt die Zugehörigkeit der Zeile VOR
 *     dem Abruf — sonst könnte eine Redaktion mit gültiger Rolle in ihrer
 *     eigenen Community die Id eines FREMDEN Mandanten einsetzen und bekäme
 *     dessen Bild. Die `fileId` kommt ausschließlich aus der geprüften Zeile,
 *     NIE aus der URL.
 *
 * NUR FÜR ENTWÜRFE GEDACHT, aber für JEDEN Zustand gültig: welche Kachel
 * diesen Weg nimmt, entscheidet der SERVER in `index.get.ts` (dort steht
 * `published` ohnehin) — nicht der Browser. Veröffentlichte Bilder bleiben auf
 * der Bucket-URL, weil sie dort zwischengespeichert werden dürfen; eine
 * Galerie mit 100 Kacheln durch Nitro zu ziehen wäre der falsche Preis für
 * eine Regel, die nur Entwürfe betrifft.
 *
 * SKALIERT, WENN MÖGLICH (max. 640 px, WebP): die Kachel ist 64×64. Die Maße
 * sind FEST und kommen bewusst nicht aus der Query — frei wählbare Größen
 * wären ein Weg, mit erfundenen Werten den Bild-Cache der Appwrite-Instanz
 * vollzuschreiben.
 *
 * `no-store`: die Antwort hängt an einer Rolle. Ein Zwischenspeicher, der sie
 * einem zweiten Betrachter ausliefert, wäre genau das Leck, das die Route
 * schließt.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): die Mediathek ist im Pool ab Plan personal enthalten.
  requirePlanProduct(event, 'media')
  await requireCommunityPermission(event, 'media.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing media id' })
  }

  const row = await tenantDb(event, { as: 'operator' })
    .get<MediaItem>(MEDIA_TABLE, id, 'Media item not found')

  const { storage } = createAdminClient(event)

  // Skaliert, wenn die Instanz es kann — sonst die Originaldatei. Dieselbe
  // Rückfallkette wie in core (`api/storage/[bucket]/[fileId].get.ts`): ohne
  // Imagick antwortet `getFilePreview` mit einem Fehler, und ein 500 wäre hier
  // die falsche Antwort auf „das Bild ist ein paar Kilobyte größer".
  const preview = await storage.getFilePreview({
    bucketId: MEDIA_BUCKET,
    fileId: row.fileId,
    width: 640,
    quality: 78,
    output: ImageFormat.Webp,
  }).catch(() => null)

  setHeader(event, 'Cache-Control', 'private, no-store')
  if (preview) {
    setHeader(event, 'Content-Type', 'image/webp')
    return Buffer.from(preview)
  }

  const meta = await storage.getFile({ bucketId: MEDIA_BUCKET, fileId: row.fileId })
    .catch((error) => { throw toH3Error(error, 'Media file not found') })
  const original = await storage.getFileView({ bucketId: MEDIA_BUCKET, fileId: row.fileId })
    .catch((error) => { throw toH3Error(error, 'Media file not found') })
  setHeader(event, 'Content-Type', meta.mimeType)
  return Buffer.from(original)
})

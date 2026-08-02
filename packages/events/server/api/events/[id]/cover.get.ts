import { ImageFormat } from 'node-appwrite'
import { EVENTS_TABLE, EVENT_COVERS_BUCKET, type EventRow } from '../../../../shared/types/event'

/**
 * VORSCHAU EINES TITELBILDS FÜR DIE REDAKTION (events.manage) — der Weg, der
 * F28 überhaupt erst möglich macht.
 *
 * WARUM ES DIESE ROUTE GIBT: das Leserecht einer Cover-DATEI ist seit F28 exakt
 * das ihrer Row (shared/coverAudience.ts). Ein ENTWURF trägt keines, also kann
 * der Browser die Datei nicht mehr direkt aus dem Bucket holen — und genau das
 * tat die Vorschau im Bearbeiten-Dialog. Vorher war die Antwort darauf, dem
 * Bild ersatzweise das MITGLIEDER-Publikum zu geben; damit sah jedes Mitglied
 * die Titelbilder unveröffentlichter Termine. Jetzt holt der Server das Bild
 * mit dem Admin-Client und liefert es nur dem aus, der den Termin auch
 * bearbeiten darf.
 *
 * ZWEI GRENZEN, BEIDE NÖTIG:
 *  1. `requireCommunityPermission(event, 'events.manage')` — Site-Rolle vor
 *     protokolliertem Operator-Break-Glass (N5). Das `await` ist Pflicht: ohne
 *     wäre der Gate fail-open.
 *  2. Die DATENTÜR als Operator. `get` belegt die Zugehörigkeit der Row VOR
 *     dem Abruf — sonst könnte eine Redaktion mit gültiger Rolle in ihrer
 *     eigenen Community die Cover-Id eines FREMDEN Mandanten einsetzen und
 *     bekäme dessen Bild. Die fileId kommt deshalb ausschließlich aus der
 *     geprüften Row, NIE aus der URL.
 *
 * FÜR ALLE ZUSTÄNDE, nicht nur Entwürfe: die Vorschau im Dialog nimmt immer
 * diesen Weg. Eine Fallunterscheidung im Browser („Entwurf → Route,
 * veröffentlicht → Bucket") wäre eine zweite Kopie der Sichtbarkeitsregel an
 * der Stelle, an der sie am wenigsten zu prüfen ist.
 *
 * SKALIERT, WENN MÖGLICH (max. 800 px, WebP): der Bearbeiten-Dialog zeigt eine
 * 80×48-Kachel.
 * Das Original wäre bei einem Handy-Foto ein paar Megabyte durch die
 * Nitro-Leitung. Die Maße sind FEST und kommen bewusst nicht aus der Query —
 * frei wählbare Größen wären ein Weg, mit erfundenen Werten den Bild-Cache der
 * Appwrite-Instanz vollzuschreiben.
 *
 * `no-store`: die Antwort hängt an einer Rolle. Ein Zwischenspeicher, der sie
 * einem zweiten Betrachter ausliefert, wäre genau das Leck, das die Route
 * schließt. Der Bild-Wechsel nach einem Upload ist damit gratis richtig.
 */
export default defineEventHandler(async (event) => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten.
  requirePlanProduct(event, 'events')
  await requireCommunityPermission(event, 'events.manage')

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  const db = tenantDb(event, { as: 'operator' })
  const row = await db.get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (!row.coverFileId) {
    throw createError({ status: 404, statusText: 'Event has no cover' })
  }

  const { storage } = createAdminClient(event)

  // Skaliert, wenn die Instanz es kann — sonst die Originaldatei. Dieselbe
  // Rückfallkette wie in core (`api/storage/[bucket]/[fileId].get.ts`): ohne
  // Imagick antwortet `getFilePreview` mit einem Fehler, und ein 500 wäre hier
  // die falsche Antwort auf „das Bild ist ein paar Kilobyte größer".
  const preview = await storage.getFilePreview({
    bucketId: EVENT_COVERS_BUCKET,
    fileId: row.coverFileId,
    width: 800,
    quality: 78,
    output: ImageFormat.Webp,
  }).catch(() => null)

  setHeader(event, 'Cache-Control', 'private, no-store')
  if (preview) {
    setHeader(event, 'Content-Type', 'image/webp')
    return Buffer.from(preview)
  }

  const meta = await storage.getFile({ bucketId: EVENT_COVERS_BUCKET, fileId: row.coverFileId })
    .catch((error) => { throw toH3Error(error, 'Cover not found') })
  const original = await storage.getFileView({ bucketId: EVENT_COVERS_BUCKET, fileId: row.coverFileId })
    .catch((error) => { throw toH3Error(error, 'Cover not found') })
  setHeader(event, 'Content-Type', meta.mimeType)
  return Buffer.from(original)
})

import { ID } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { MEDIA_TABLE, MEDIA_BUCKET, MAX_MEDIA_BYTES, type MediaItem } from '../../../shared/types/media'

/**
 * Bild hochladen + Row anlegen (media.manage): Multipart mit `file` +
 * optional `title`/`subtitle`/`alt`. Magic-Bytes-Check (Muster events-Cover)
 * — der deklarierte MIME-Typ ist Client-Input. Orphan-Cleanup, wenn die
 * Row nach dem Upload scheitert.
 *
 * SICHTBARKEIT (media-002): Row UND Datei tragen das Leserecht selbst. Neue
 * Einträge entstehen veröffentlicht (published: true) und bekommen deshalb
 * beide read(any) — ein späterer Entwurfs-Zustand entzieht es wieder
 * (applyMediaVisibility).
 *
 * DATENTÜR (C1b): `create` stempelt den Mandanten. `as:'operator'` ist fachlich
 * nötig — `media_items` trägt seit media-002 KEINE Table-Permissions, ein
 * Session-Client darf dort nicht schreiben; Medien anlegen ist Server-Sache
 * hinter `media.manage`. Der Admin-Client umgeht Row-Permissions, damit ist die
 * Tür hier die EINZIGE Mandanten-Grenze.
 *
 * Die Row-Permissions bleiben explizit (mediaPermissionsFor) statt aus der Tür:
 * das Publikum hängt am `published`-Status, nicht am Mandanten — veröffentlichte
 * Galerie-Bilder sind bewusst read(any) (Gäste sehen die Galerie), Entwürfe
 * tragen nur den Verwaltungs-Read. Die DATEI im Bucket trägt keinen Mandanten;
 * die Referenz (fileId) auf der gestempelten Row tut es (Muster events-Cover).
 *
 * AUTORISIERUNG (S3): `requireCommunityPermission` — Site-Rolle vor protokolliertem
 * Operator-Break-Glass; ohne Mandanten-Kontext (Silo) weiterhin globales Label.
 * Das `await` ist Pflicht — ohne wäre der Gate fail-open.
 */
function isImage(data: Buffer): boolean {
  if (data.length < 12) return false
  const jpeg = data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF
  const png = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
  const webp = data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP'
  return jpeg || png || webp
}

export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'media.manage')

  const form = await readMultipartFormData(event)
  const filePart = form?.find(part => part.name === 'file' && part.filename)
  const field = (name: string) => form?.find(part => part.name === name && !part.filename)?.data.toString('utf8').trim() ?? ''

  if (!filePart?.filename) {
    throw createError({ status: 400, statusText: 'Missing file field' })
  }
  if (!/\.(jpe?g|png|webp)$/i.test(filePart.filename) || !isImage(filePart.data)) {
    throw createError({ status: 415, statusText: 'Only JPEG, PNG or WebP images are supported' })
  }
  if (filePart.data.length > MAX_MEDIA_BYTES) {
    throw createError({ status: 413, statusText: 'File too large' })
  }

  const title = field('title') || filePart.filename.replace(/\.[a-z0-9]+$/i, '')
  if (title.length > 200) {
    throw createError({ status: 422, statusText: 'Title too long' })
  }
  const subtitle = field('subtitle').slice(0, 200)
  const alt = field('alt').slice(0, 300)

  const admin = createAdminClient(event)
  const db = tenantDb(event, { as: 'operator' })

  const published = true
  const permissions = mediaPermissionsFor(event, published)

  const file = await admin.storage.createFile({
    bucketId: MEDIA_BUCKET,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(filePart.data, filePart.filename),
    permissions,
  }).catch((error) => { throw toH3Error(error, 'Media bucket missing — run migrations') })

  const row = await db.create<MediaItem>(MEDIA_TABLE, {
    title, subtitle, alt, fileId: file.$id, featured: false, published, sortOrder: 0,
  }, { permissions }).catch(async (error) => {
    // Row gescheitert → verwaiste Datei nicht liegen lassen
    await admin.storage.deleteFile({ bucketId: MEDIA_BUCKET, fileId: file.$id }).catch(() => {})
    throw toH3Error(error, 'Could not save media item')
  })

  setResponseStatus(event, 201)
  return { id: row.$id, title }
})

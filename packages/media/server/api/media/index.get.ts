import { Query } from 'node-appwrite'
import { MEDIA_TABLE, MEDIA_BUCKET, type MediaItem, type PublicMediaItem } from '../../../shared/types/media'
import { storageImageUrl } from '../../../../core/shared/storageImage'

const PAGE_LIMIT = 100

/**
 * Galerie-Liste, nach sortOrder (dann neueste zuerst). Zwei Modi:
 * - öffentlich (Default): nur published, schlanke PublicMediaItem-Form —
 *   user-agnostisch (Microcache-Kandidat, v2)
 * - ?all=1 (media.manage): ALLE Einträge inkl. Entwürfe, volle Row-Form
 *   (Verwaltungs-Sicht /dashboard/media)
 *
 * Der `published`-Filter ist seit media-002 NICHT mehr der einzige Schutz:
 * Row und Datei tragen das Leserecht selbst (rowSecurity/fileSecurity), ein
 * Entwurf ist also auch an dieser Route vorbei nicht abrufbar.
 *
 * View-URLs zeigen direkt in den Bucket — für veröffentlichte Einträge trägt
 * die Datei read(any), Entwurfs-Dateien nur den Verwaltungs-Read.
 *
 * DATENTÜR (C1b): beide Modi gehen über tenantDb(event) — die Liste trägt den
 * Mandanten-Filter also immer.
 *  - öffentlich: Mitglieder-/Gast-Klinke. Veröffentlichte Rows tragen read(any)
 *    (media-002), der Session-Client sieht sie auch ohne Session; die
 *    Row-Permissions bleiben so die Autorität, der Filter ist das Netz darunter.
 *  - ?all=1: `as:'operator'` ist hier fachlich NÖTIG — Entwurfs-Rows tragen
 *    BEWUSST kein breites Leserecht (media-002), der Session-Client bekäme sie
 *    gar nicht zu sehen. Der Admin-Client umgeht Row-Permissions, damit ist die
 *    Tür in diesem Zweig die EINZIGE Mandanten-Grenze.
 *
 * AUTORISIERUNG (S3): `requireCommunityPermission` — `media.manage` IST eine
 * Site-Capability (EDITOR-Bündel, communityAuthz.ts), und /dashboard/media
 * verlangt genau sie. Das `await` ist Pflicht — ohne wäre der Gate fail-open.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const withDrafts = getQuery(event).all !== undefined
  if (withDrafts) await requireCommunityPermission(event, 'media.manage')

  const db = tenantDb(event, withDrafts ? { as: 'operator' } : {})
  const res = await db.list<MediaItem>(MEDIA_TABLE, [
    ...(withDrafts ? [] : [Query.equal('published', true)]),
    Query.orderAsc('sortOrder'),
    Query.orderDesc('$createdAt'),
    Query.limit(PAGE_LIMIT),
  ]).catch((error) => { throw toH3Error(error, 'Could not load media') })

  const base = {
    endpoint: config.public.appwriteEndpoint,
    projectId: config.public.appwriteProjectId,
  }
  // Skaliert statt Originaldatei (Bild-Naht): die Galerie zeigt Vorschauen,
  // kein Originalmaterial. Die Größenwahl macht seit C14 <NuxtImg> mit dem
  // Appwrite-Anbieter — der rechnet diese Vorschau-URL je Aufrufstelle um.
  const srcOf = (fileId: string) =>
    storageImageUrl(base, MEDIA_BUCKET, fileId, { width: 960, quality: 78, output: 'webp' })

  if (withDrafts) {
    return { items: res.rows.map(row => ({ ...row, src: srcOf(row.fileId) })) }
  }
  const items: PublicMediaItem[] = res.rows.map(row => ({
    id: row.$id,
    title: row.title,
    subtitle: row.subtitle,
    alt: row.alt || row.title,
    featured: row.featured,
    src: srcOf(row.fileId),
  }))
  return { items }
})

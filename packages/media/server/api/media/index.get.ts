import { Query } from 'node-appwrite'
import { MEDIA_TABLE, MEDIA_BUCKET, type MediaItem, type PublicMediaItem } from '../../../shared/types/media'
import { storageImageSrcset, storageImageUrl } from '../../../../core/shared/storageImage'

/**
 * Galerie-Breiten für das `srcset` (Bild-Naht, 2026-07-28). Drei Stufen decken
 * Handy, Tablet und Desktop ab — inklusive Retina, weil der Browser bei
 * gleicher CSS-Breite die doppelte Pixelzahl wählt. Mehr Stufen bedeuten mehr
 * Varianten, die Appwrite erzeugen und cachen muss, und die CPU dafür läuft auf
 * derselben Maschine wie die Apps.
 */
const GALLERY_WIDTHS = [480, 960, 1600]

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
 * Entwurf ist also auch an dieser Route vorbei nicht abrufbar. Der Filter
 * bleibt als Sicherheitsnetz und weil die Liste über den Admin-Client läuft
 * (der Row-Permissions bewusst umgeht).
 *
 * View-URLs zeigen direkt in den Bucket — für veröffentlichte Einträge trägt
 * die Datei read(any), Entwurfs-Dateien nur den Verwaltungs-Read.
 *
 * AUTORISIERUNG (S3): `requireSitePermission` — `media.manage` IST eine
 * Site-Capability (EDITOR-Bündel, tenantAuthz.ts), und /dashboard/media
 * verlangt genau sie. Das `await` ist Pflicht — ohne wäre der Gate fail-open.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const withDrafts = getQuery(event).all !== undefined
  if (withDrafts) await requireSitePermission(event, 'media.manage')

  const res = await admin.tablesDB.listRows<MediaItem>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: MEDIA_TABLE,
    queries: [
      ...(withDrafts ? [] : [Query.equal('published', true)]),
      Query.orderAsc('sortOrder'),
      Query.orderDesc('$createdAt'),
      Query.limit(PAGE_LIMIT),
    ],
  }).catch((error) => { throw toH3Error(error, 'Could not load media') })

  const base = {
    endpoint: config.public.appwriteEndpoint,
    projectId: config.public.appwriteProjectId,
  }
  // Skaliert statt Originaldatei (Bild-Naht): die Galerie zeigt Vorschauen,
  // kein Originalmaterial. `srcset` überlässt dem Browser die Größenwahl.
  const srcOf = (fileId: string) =>
    storageImageUrl(base, MEDIA_BUCKET, fileId, { width: 960, quality: 78, output: 'webp' })
  const srcsetOf = (fileId: string) =>
    storageImageSrcset(base, MEDIA_BUCKET, fileId, GALLERY_WIDTHS, { quality: 78, output: 'webp' })

  if (withDrafts) {
    return { items: res.rows.map(row => ({ ...row, src: srcOf(row.fileId), srcset: srcsetOf(row.fileId) })) }
  }
  const items: PublicMediaItem[] = res.rows.map(row => ({
    id: row.$id,
    title: row.title,
    subtitle: row.subtitle,
    alt: row.alt || row.title,
    featured: row.featured,
    src: srcOf(row.fileId),
    srcset: srcsetOf(row.fileId),
  }))
  return { items }
})

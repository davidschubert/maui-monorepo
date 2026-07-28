import { Query } from 'node-appwrite'
import { MEDIA_TABLE, MEDIA_BUCKET, type MediaItem, type PublicMediaItem } from '../../../shared/types/media'

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

  const endpoint = config.public.appwriteEndpoint
  const project = config.public.appwriteProjectId
  const srcOf = (fileId: string) => `${endpoint}/storage/buckets/${MEDIA_BUCKET}/files/${fileId}/view?project=${project}`

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

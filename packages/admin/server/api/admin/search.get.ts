import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'

interface SearchResult {
  users: { $id: string, name: string, email: string }[]
  comments: { $id: string, content: string, authorId: string, authorName: string }[]
}

type CommentRow = Models.Row & { content: string, authorId: string, authorName: string }

/**
 * Globale Admin-Suche (User + Kommentare) für die Command-Palette.
 *
 * MANDANTENDICHT (Audit-Befund B2, 2026-07-27): diese Route läuft bei JEDEM
 * Tastendruck und gibt Volltexte bzw. Namen zurück — sie war damit das
 * schärfste der drei Lecks.
 *  - Kommentare gehen durch die Datentür; die Volltextsuche findet nur noch
 *    Zeilen DIESES Mandanten.
 *  - Nutzer entfallen im Pool: `users.list({search})` durchsucht den geteilten
 *    Projekt-Bestand, also die Konten aller Communities (mit `users.manage`
 *    inklusive E-Mail). Wer Mitglied DIESER Site ist, steht in `site_members`
 *    im Control Plane — ein Cross-Projekt-Vertrag, den die Palette nicht
 *    rechtfertigt. Kein Treffer ist besser als ein fremder; die Palette blendet
 *    die leere Gruppe ohnehin aus. Silo/Einzelbetrieb unverändert.
 */
export default defineEventHandler(async (event): Promise<SearchResult> => {
  const requester = requirePermission(event, 'dashboard.access')
  // E-Mail ist PII: nur mit users.manage in der Antwort (RBAC-CONCEPT —
  // dashboard.access-Gate gilt nur ohne PII). Moderatoren sehen nur Namen.
  const includeEmail = hasCapability(requester.labels, 'users.manage')

  const q = String(getQuery(event).q ?? '').trim()
  if (q.length < 2) return { users: [], comments: [] }

  const db = tenantDb(event, { as: 'operator' })
  const poolTenant = db.tenant?.mode === 'pool'
  const admin = createAdminClient(event)

  const [users, comments] = await Promise.all([
    poolTenant
      ? Promise.resolve({ users: [] as Models.User<Models.Preferences>[] })
      : admin.users.list({ search: q, queries: [Query.limit(5)] })
          .catch(() => ({ users: [] as Models.User<Models.Preferences>[] })),
    db.list<CommentRow>('comments', [Query.search('content', q), Query.limit(5)])
      .catch(() => ({ rows: [] as CommentRow[] })),
  ])

  return {
    users: users.users.map(u => ({ $id: u.$id, name: u.name, email: includeEmail ? u.email : '' })),
    comments: comments.rows.map(r => ({
      $id: r.$id,
      content: r.content.length > 80 ? `${r.content.slice(0, 80)}…` : r.content,
      authorId: r.authorId,
      authorName: r.authorName,
    })),
  }
})

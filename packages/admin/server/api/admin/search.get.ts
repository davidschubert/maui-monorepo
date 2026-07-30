import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { decideSiteAccess } from '../../../../core/shared/siteAccess'

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
 *    inklusive E-Mail). Wer Mitglied DIESER Site ist, steht in `community_members`
 *    im Control Plane — ein Cross-Projekt-Vertrag, den die Palette nicht
 *    rechtfertigt. Kein Treffer ist besser als ein fremder; die Palette blendet
 *    die leere Gruppe ohnehin aus. Silo/Einzelbetrieb unverändert.
 *
 * AUTORISIERUNG (Befund B7, 2026-07-29 — Davids Entscheidung): der Gate ist
 * `await requireSitePermission(event, 'dashboard.access')` statt des
 * label-only `requirePermission`. Vorher kam ein Kunden-Owner ohne globales
 * Label hier gar nicht durch — die Palette lief für JEDES Site-Mitglied ins
 * 403 und blieb stumm (dieselbe Klasse wie C1 bei stats/analytics).
 *
 * KOMMENTAR-TREFFER NUR MIT `comments.moderate` (Site-Rolle ODER
 * Operator-Label, über `decideSiteAccess` — genau das Muster, mit dem
 * stats.get.ts `commentsReported` schützt): sobald der Gate die MITGLIEDSCHAFT
 * belegt, tragen ihn ALLE fünf Site-Rollen, also auch `viewer` und `editor`.
 * Ein Treffer führt per Deeplink in die Moderations-Warteschlange
 * (`/dashboard/comments?comment=<id>`, dort `comments.moderate`) — wer suchen
 * darf, soll danach auch handeln können, und der Volltext eines Kommentars ist
 * Moderations-Wissen wie die Zahl der offenen Meldungen. Ohne die Capability
 * liefert die Route keine Kommentare; die Palette blendet die Gruppe zusätzlich
 * aus (Doppelquelle wie in der Nav), damit keine Überschrift ohne Inhalt
 * erscheint.
 */
export default defineEventHandler(async (event): Promise<SearchResult> => {
  const { user, role } = await requireSitePermission(event, 'dashboard.access')
  const labels = user.labels ?? []
  // E-Mail ist PII: nur mit users.manage in der Antwort (RBAC-CONCEPT —
  // dashboard.access-Gate gilt nur ohne PII). Moderatoren sehen nur Namen.
  const includeEmail = hasCapability(labels, 'users.manage')

  const q = String(getQuery(event).q ?? '').trim()
  if (q.length < 2) return { users: [], comments: [] }

  const tenant = useTenant(event)
  const db = tenantDb(event, { as: 'operator' })
  const poolTenant = tenant?.mode === 'pool'
  const canModerate = decideSiteAccess({
    capability: 'comments.moderate',
    labels,
    tenantScoped: Boolean(tenant),
    role,
  }).allowed
  const admin = createAdminClient(event)

  const [users, comments] = await Promise.all([
    poolTenant
      ? Promise.resolve({ users: [] as Models.User<Models.Preferences>[] })
      : admin.users.list({ search: q, queries: [Query.limit(5)] })
          .catch(() => ({ users: [] as Models.User<Models.Preferences>[] })),
    canModerate
      ? db.list<CommentRow>('comments', [Query.search('content', q), Query.limit(5)])
          .catch(() => ({ rows: [] as CommentRow[] }))
      : Promise.resolve({ rows: [] as CommentRow[] }),
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

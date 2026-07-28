import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { AdminAnalytics } from '../../../shared/types/admin'

const ALLOWED_DAYS = [7, 30, 90]
const PAGE = 100
// Sicherheitskappe je Reihe (~10k Rows). Bei Dev-Maßstab nie erreicht; verhindert
// im Extremfall eine entgleisende Pagination. Wird sie getroffen, undercounten
// Chart UND Total gemeinsam (konsistent) — siehe Warnung unten.
const MAX_PAGES = 100

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Alle `$createdAt`-Werte ab `cutoffIso` paginiert einsammeln — per CURSOR
 * statt Offset: landet während der Pagination eine neue Zeile (Realtime-App!),
 * verschieben sich Offset-Seiten und Zeilen doppeln/fehlen; der Cursor bleibt
 * stabil.
 */
async function collectCreatedAt(
  total: { count: number, capped: boolean },
  loadPage: (cursor: string | undefined) => Promise<{ items: { id: string, createdAt: string }[], total: number }>,
): Promise<string[]> {
  const out: string[] = []
  let cursor: string | undefined
  for (let p = 0; p < MAX_PAGES; p++) {
    const res = await loadPage(cursor).catch(() => null)
    if (!res) break
    out.push(...res.items.map(item => item.createdAt))
    total.count = res.total
    if (res.items.length < PAGE) {
      total.capped = false
      return out
    }
    cursor = res.items.at(-1)!.id
  }
  total.capped = true
  return out
}

/**
 * Tages-Zeitreihe für Registrierungen + Kommentare im gewählten Zeitraum.
 * Chart-Buckets UND KPI-Totals stammen aus DERSELBEN paginierten In-Range-Menge
 * → Balken und Legende können nicht auseinanderlaufen (früher: 200er-Sample für
 * die Buckets vs. autoritative Count-Query für die Totals). Admin-only.
 *
 * MANDANTENDICHT (Audit-Befund B2, 2026-07-27):
 *  - Kommentare gehen durch die Datentür (`tenantDb`, operator-Klinke wie
 *    bisher der Admin-Client) — die frühere rohe Abfrage zeichnete im Pool die
 *    Zeitreihe ALLER Mandanten in das Dashboard EINES Kunden.
 *  - Registrierungen entfallen im Pool: `users.list()` ist die Nutzerliste des
 *    geteilten PROJEKTS, nicht die Mitglieder dieser Site. Eine mandanten-
 *    genaue Zahl gäbe es nur über `site_members` im Control Plane — ein neuer
 *    Cross-Projekt-Vertrag, den diese Kennzahl nicht rechtfertigt. Lieber
 *    keine Zahl als eine fremde (`usersInRange: null`, Balken bleiben leer).
 */
export default defineEventHandler(async (event): Promise<AdminAnalytics> => {
  requirePermission(event, 'dashboard.access')

  const db = tenantDb(event, { as: 'operator' })
  const admin = createAdminClient(event)
  const poolTenant = db.tenant?.mode === 'pool'

  const requested = Number(getQuery(event).days ?? 30)
  const DAYS = ALLOWED_DAYS.includes(requested) ? requested : 30

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setUTCDate(cutoff.getUTCDate() - (DAYS - 1))
  const cutoffIso = cutoff.toISOString()

  const userTotal = { count: 0, capped: false }
  const commentTotal = { count: 0, capped: false }

  const [userDates, commentDates] = await Promise.all([
    poolTenant
      ? Promise.resolve<string[]>([])
      : collectCreatedAt(userTotal, async (cursor) => {
          const r = await admin.users.list({
            queries: [Query.greaterThanEqual('$createdAt', cutoffIso), Query.orderDesc('$createdAt'), Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
          })
          return { items: r.users.map(u => ({ id: u.$id, createdAt: u.$createdAt })), total: r.total }
        }),
    collectCreatedAt(commentTotal, async (cursor) => {
      const r = await db.list<Models.Row>('comments', [
        Query.greaterThanEqual('$createdAt', cutoffIso), Query.orderDesc('$createdAt'), Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ])
      return { items: r.rows.map(row => ({ id: row.$id, createdAt: row.$createdAt })), total: r.total }
    }),
  ])

  if (userTotal.capped || commentTotal.capped) {
    console.warn(`[analytics] In-Range-Menge an MAX_PAGES (${MAX_PAGES * PAGE}) gekappt — Chart/Total untercounten.`)
  }

  const buckets = new Map<string, { users: number, comments: number }>()
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(cutoff)
    d.setUTCDate(d.getUTCDate() + i)
    buckets.set(dayKey(d), { users: 0, comments: 0 })
  }

  for (const iso of userDates) {
    const bucket = buckets.get(dayKey(new Date(iso)))
    if (bucket) bucket.users++
  }
  for (const iso of commentDates) {
    const bucket = buckets.get(dayKey(new Date(iso)))
    if (bucket) bucket.comments++
  }

  const points = [...buckets.entries()].map(([date, value]) => ({ date, users: value.users, comments: value.comments }))

  return {
    rangeDays: DAYS,
    points,
    // Totals aus derselben Menge wie die Buckets → konsistent mit dem Chart.
    // null = im Pool bewusst nicht ausgewiesen (s. Kopfkommentar).
    usersInRange: poolTenant ? null : userDates.length,
    commentsInRange: commentDates.length,
  }
})

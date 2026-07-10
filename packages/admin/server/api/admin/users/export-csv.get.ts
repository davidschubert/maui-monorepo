import { Query } from 'node-appwrite'

/**
 * CSV-Export der User-Liste (users.manage): ALLE Accounts per Cursor-
 * Pagination, sichere Felder (kein prefs-Inhalt außer nichts — Datensparsamkeit
 * wie AdminUserRow). Excel-tauglich: BOM + CRLF + Formel-Injection-Guard
 * (führende =+-@ werden mit ' entschärft). Audit-Eintrag pro Export.
 */

const PAGE = 100
const HARD_CAP = 50_000

function csvCell(value: string | boolean): string {
  let s = String(value)
  // Formel-Injection (Excel/Sheets interpretiert führende =+-@)
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.manage')

  const admin = createAdminClient(event)
  const lines = ['id,name,email,createdAt,lastActivityAt,status,labels,emailVerified']

  let cursor: string | undefined
  for (;;) {
    const res = await admin.users.list({
      queries: [Query.orderAsc('$createdAt'), Query.limit(PAGE), ...(cursor ? [Query.cursorAfter(cursor)] : [])],
    })
    for (const user of res.users) {
      lines.push([
        csvCell(user.$id),
        csvCell(user.name),
        csvCell(user.email),
        csvCell(user.$createdAt),
        csvCell(user.accessedAt ?? ''),
        csvCell(user.status ? 'active' : 'blocked'),
        csvCell(user.labels.join('|')),
        csvCell(user.emailVerification),
      ].join(','))
    }
    if (res.users.length < PAGE) break
    if (lines.length >= HARD_CAP) {
      console.warn(`[admin] CSV-Export an HARD_CAP (${HARD_CAP}) gekappt`)
      break
    }
    cursor = res.users.at(-1)!.$id
  }

  await recordAudit(event, {
    action: 'user.csv_exported',
    targetType: 'user',
    targetId: '',
    metadata: { count: lines.length - 1 },
  })

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`)
  // BOM: Excel erkennt UTF-8 sonst nicht (Umlaute in Namen)
  return `\uFEFF${lines.join('\r\n')}\r\n`
})

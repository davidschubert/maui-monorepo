import type { Models } from 'node-appwrite'

/**
 * DSGVO-Export-Mapper — geteilt zwischen Self-Export (auth/export) und
 * Admin-Export (users/[id]/export), damit beide dieselbe stabile JSON-Form
 * liefern. Auto-importiert in alle Server-Routen.
 */

type ExportCommentRow = Models.Row & { content: string, targetType: string, targetId: string, status: string }

export function mapExportAccount(user: Models.User<Models.Preferences>) {
  return {
    id: user.$id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    registration: user.registration,
    emailVerification: user.emailVerification,
    status: user.status,
    labels: user.labels,
    prefs: user.prefs,
  }
}

export function mapExportSessions(sessions: Models.Session[]) {
  return sessions.map(s => ({
    id: s.$id,
    createdAt: s.$createdAt,
    ip: s.ip,
    client: [s.clientName, s.clientVersion].filter(Boolean).join(' '),
    os: [s.osName, s.osVersion].filter(Boolean).join(' '),
    country: s.countryName,
  }))
}

export function mapExportComments(rows: ExportCommentRow[]) {
  return rows.map(r => ({
    id: r.$id,
    createdAt: r.$createdAt,
    content: r.content,
    targetType: r.targetType,
    targetId: r.targetId,
    status: r.status,
  }))
}

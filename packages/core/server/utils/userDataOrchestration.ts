import { ID, Permission, Role } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import type { H3Event } from 'h3'
import { createSessionClient } from '../lib/appwrite'

/**
 * GDPR-Orchestrierung (Plan: docs/plans/GDPR-DELETE-AND-EXPORT.md §4.3).
 *
 * `exportUserCompletely` sammelt Account + Sessions (Core-Domäne) und die
 * Daten aller registrierten UserDataContributors — vollständig, paginiert.
 *
 * `deleteUserCompletely` löscht „best effort mit hartem Abschlusskriterium":
 * Snapshot → Sperren → Audit → Contributors (sequenziell, isoliert) →
 * Core-Cleanups (Avatar, Presence) → `users.delete()` NUR bei Voll-Erfolg.
 * Ein Teilfehler hinterlässt einen GESPERRTEN Account + actionablen Report;
 * alle Schritte sind idempotent → gefahrloser Re-Run räumt den Rest ab.
 */

export interface UserDataExport {
  exportedAt: string
  account: ReturnType<typeof mapExportAccount>
  sessions: ReturnType<typeof mapExportSessions>
  data: Record<string, unknown>
}

export interface ContributorRunResult {
  id: string
  ok: boolean
  deleted: number
  anonymized: number
  error?: string
}

export interface DeleteUserResult {
  ok: boolean
  /** fileId des Pre-Delete-Snapshots (falls Bucket konfiguriert) */
  exportFileId?: string
  results: ContributorRunResult[]
}

/** Aufbewahrungsfrist der Snapshots (Lazy-Cleanup, Plan §4.8) */
export const GDPR_EXPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export async function exportUserCompletely(
  event: H3Event,
  userId: string,
  opts: { via: 'session' | 'admin' },
): Promise<UserDataExport> {
  const admin = createAdminClient(event)

  // Account immer über die Users-API (voller Datensatz); im Session-Pfad ist
  // der Context-User der Fallback für einen einzelnen Blip.
  const account = await admin.users.get({ userId })
    .catch(() => (opts.via === 'session' ? event.context.user : null))
  if (!account) {
    throw createError({ status: 404, statusText: 'User not found' })
  }

  const sessions = opts.via === 'session'
    ? await createSessionClient(event).account.listSessions().catch(() => ({ sessions: [] as Models.Session[] }))
    : await admin.users.listSessions({ userId }).catch(() => ({ sessions: [] as Models.Session[] }))

  const data: Record<string, unknown> = {}
  for (const contributor of listUserDataContributors()) {
    // Export MUSS vollständig sein — ein werfender Contributor bricht ab
    // (halbe Exporte wären schlimmer als ein klarer Fehler).
    data[contributor.id] = await contributor.exportUserData(event, userId)
  }

  return {
    exportedAt: new Date().toISOString(),
    account: mapExportAccount(account),
    sessions: mapExportSessions(sessions.sessions),
    data,
  }
}

/** Snapshot in den gdpr-exports-Bucket schreiben; wirft bei Fehlern (Abbruchkriterium). */
async function writeSnapshot(event: H3Event, userId: string, payload: UserDataExport): Promise<string | undefined> {
  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteGdprBucket
  if (!bucketId) return undefined // Bucket nicht konfiguriert → Löschung ohne Snapshot

  const admin = createAdminClient(event)
  const filename = `gdpr-export-${userId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const file = await admin.storage.createFile({
    bucketId,
    fileId: ID.unique(),
    file: InputFile.fromBuffer(Buffer.from(JSON.stringify(payload, null, 2)), filename),
    // Zweitverteidigung — die eigentliche Autorität sind die Admin-Routen
    // (requirePermission users.manage); der Browser hat ohnehin keine SDK-Session.
    permissions: [Permission.read(Role.label('admin'))],
  })

  // Lazy-Cleanup: abgelaufene Alt-Snapshots gleich mit abräumen (best effort)
  await cleanupExpiredGdprExports(event).catch(() => {})

  return file.$id
}

/** Alle Snapshots älter als die Aufbewahrungsfrist löschen (Lazy-Cleanup, §4.8). */
export async function cleanupExpiredGdprExports(event: H3Event): Promise<number> {
  const config = useRuntimeConfig(event)
  const bucketId = config.public.appwriteGdprBucket
  if (!bucketId) return 0

  const admin = createAdminClient(event)
  const cutoff = Date.now() - GDPR_EXPORT_RETENTION_MS
  let removed = 0
  // Bucket bleibt klein (Frist!) — eine 100er-Seite pro Aufruf reicht; der
  // nächste Aufruf räumt Rest-Seiten (Lazy-Prinzip).
  const files = await admin.storage.listFiles({ bucketId })
  for (const file of files.files) {
    if (Date.parse(file.$createdAt) < cutoff) {
      await admin.storage.deleteFile({ bucketId, fileId: file.$id }).catch(() => {})
      removed++
    }
  }
  return removed
}

export async function deleteUserCompletely(
  event: H3Event,
  userId: string,
  opts: { actor: 'self' | 'admin' },
): Promise<DeleteUserResult> {
  const admin = createAdminClient(event)

  // (0) Existiert der Auth-User noch? 404 → Orphan-Cleanup-Modus (Re-Run,
  // defensiv): Snapshot/Sperren/Audit überspringen, nur noch aufräumen.
  const user = await admin.users.get({ userId }).catch(() => null)

  let exportFileId: string | undefined
  if (user) {
    // (1) SNAPSHOT — Fehler hier = Abbruch (ohne Snapshot keine Löschung)
    const snapshot = await exportUserCompletely(event, userId, { via: 'admin' })
    exportFileId = await writeSnapshot(event, userId, snapshot)

    // (2) SPERREN — der User kann während des Cleanups nichts Neues erzeugen;
    // ein Teilfehler hinterlässt einen gesperrten (handlungsunfähigen) Account.
    // STRIKT: ohne erfolgreichen Block keine destruktiven Schritte — sonst
    // könnte ein Teilfehler einen UNgesperrten, halb bereinigten Account
    // hinterlassen. Re-Run nach Fehler ist gefahrlos (alles idempotent).
    await admin.users.updateStatus({ userId, status: false })
    // Session-Kill bleibt best effort: der Block macht bestehende Sessions
    // ohnehin handlungsunfähig.
    await admin.users.deleteSessions({ userId }).catch(() => {})

    // (3) AUDIT — OHNE Klarnamen (der steht im Snapshot, nicht im Log)
    if (opts.actor === 'self') {
      await logAuthEvent(event, 'user.self_deleted', { userId, name: '' })
    }
    // admin-Pfad: recordAudit macht die Route (admin-Layer-Util, core kennt ihn nicht)
  }

  // (4) CONTRIBUTORS — sequenziell, isoliert; ein kaputter Layer blockiert
  // nicht das Aufräumen der anderen.
  const results: ContributorRunResult[] = []
  for (const contributor of listUserDataContributors()) {
    try {
      const result = await contributor.deleteUserData(event, userId)
      results.push({ id: contributor.id, ok: true, ...result })
    }
    catch (error) {
      results.push({ id: contributor.id, ok: false, deleted: 0, anonymized: 0, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // (5) CORE-EIGENE CLEANUPS (einzeln best effort; 404 = schon weg = Erfolg)
  const config = useRuntimeConfig(event)
  const prefs = user?.prefs as { avatarUrl?: string } | undefined
  const avatarId = avatarFileId(prefs?.avatarUrl, config.public.appwriteAvatarsBucket)
  if (avatarId) {
    await admin.storage.deleteFile({ bucketId: config.public.appwriteAvatarsBucket, fileId: avatarId }).catch(() => {})
  }
  await admin.presences.delete({ presenceId: userId }).catch(() => {})

  // (6) FINALISIEREN — users.delete NUR bei Voll-Erfolg (hartes Abschlusskriterium)
  const allOk = results.every(r => r.ok)
  if (allOk && user) {
    await admin.users.delete({ userId })
  }

  return { ok: allOk, exportFileId, results }
}

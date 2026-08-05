import { Query } from 'node-appwrite'
import type { Models } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * GDPR-Contributor des system-Layers (Vertrag: core/server/utils/userData.ts)
 * — der erste Server-Code in diesem Layer (bisher reiner Schema-Owner).
 *
 * notifications: Export als Empfänger; Löschung als Empfänger UND als
 * Verursacher (per senderId, Migration system-008 — Alt-Rows ohne senderId
 * sind die akzeptierte E8-Lücke: nur der Empfänger kann sie lesen, sie
 * sterben mit dessen Löschung).
 *
 * audit_logs: PSEUDONYMISIERUNG statt Löschung (Art. 17 (3) e — Audit-
 * Integrität): actorName/ip/metadata.name leeren, actorId + Struktur
 * bleiben (nach users.delete keinem Menschen mehr zuordenbar); targetName
 * für Logs, die auf den User zeigen, ebenfalls leeren. Plan §4.6.
 *
 * activities (Migration 014): Export + Hard-Delete als Verursacher (per
 * actorId, idx_actor) — Feed-Einträge sind reine Verhaltens-Daten, es gibt
 * keinen Empfänger. Query degradiert auf leere Menge, solange die Table
 * auf einer Instanz noch nicht existiert (Migration ausstehend).
 *
 * community_handles (Migration 029): Export + Hard-Delete, über ALLE
 * Communities (der Mensch kann in mehreren einen Namen haben) und über beide
 * Status — auch die 'former'-Zeilen, denn ein früherer Name ist genauso ein
 * personenbezogenes Datum wie der aktuelle.
 *
 * DAS GIBT DEN NAMEN WIEDER FREI, und das ist eine bewusste Abwägung gegen
 * Davids Entscheidung 4 („der alte Handle bleibt gesperrt"). Diese Sperre
 * schützt vor Verwechslung nach einer UMBENENNUNG; hier wird das Konto
 * gelöscht. Die Alternative wäre ein Grabstein, der `davidschubert` für immer
 * aufbewahrt — also genau die personenbezogene Zeichenkette, die zu löschen
 * war, und `deleteUserCompletely` löscht das Konto nur bei VOLL-Erfolg.
 * Der Rest-Fall ist klein und harmlos: eine alte Erwähnung löst danach auf
 * NIEMANDEN mehr auf und wird deshalb gar nicht erst hervorgehoben
 * (splitMentions ist fail-closed) — sie bleibt gewöhnlicher Text.
 */

type NotificationRow = Models.Row & { recipientId: string, type: string, title: string, body: string, link: string, read: boolean }
type AuditRow = Models.Row & { actorId: string, actorName: string, action: string, targetId: string, targetName: string, metadata: string, ip: string }
type ActivityRow = Models.Row & { actorId: string, actorName: string, type: string, objectType: string, objectId: string, link: string, metadata: string, visibility: string }
type HandleRow = Models.Row & { communityId: string, userId: string, handle: string, handleLower: string, status: string, changedAt: string }

const NOTIFICATIONS = 'notifications'
const AUDIT_LOGS = 'audit_logs'
const ACTIVITIES = 'activities'
const HANDLES = 'community_handles'

interface SystemUserDataExport {
  notifications: Array<{ type: string, title: string, body: string, link: string, read: boolean, createdAt: string }>
  activities: Array<{ type: string, objectType: string, objectId: string, link: string, createdAt: string }>
  handles: Array<{ communityId: string, handle: string, status: string, changedAt: string, createdAt: string }>
}

export async function systemExportUserData(event: H3Event, userId: string): Promise<SystemUserDataExport> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  const received = await listAllRows<NotificationRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    NOTIFICATIONS,
    [Query.equal('recipientId', userId)],
  )
  // Degradiert auf leer, solange Migration 014 auf der Instanz aussteht
  const activities = await listAllRows<ActivityRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    ACTIVITIES,
    [Query.equal('actorId', userId)],
  ).catch(() => [] as ActivityRow[])
  // Degradiert auf leer, solange Migration 029 auf der Instanz aussteht
  const handles = await listAllRows<HandleRow>(
    tablesDB,
    config.public.appwriteDatabaseId,
    HANDLES,
    [Query.equal('userId', userId)],
  ).catch(() => [] as HandleRow[])
  return {
    notifications: received.map(r => ({
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      read: r.read,
      createdAt: r.$createdAt,
    })),
    activities: activities.map(r => ({
      type: r.type,
      objectType: r.objectType,
      objectId: r.objectId,
      link: r.link,
      createdAt: r.$createdAt,
    })),
    // Beide Status — ein FRÜHERER Name gehört genauso in die Auskunft.
    handles: handles.map(r => ({
      communityId: r.communityId,
      handle: r.handle,
      status: r.status,
      changedAt: r.changedAt,
      createdAt: r.$createdAt,
    })),
  }
}

/**
 * Personenbezogene Felder aus dem metadata-JSON einer Audit-Zeile entfernen.
 *
 * `name`: `self_deleted` trug sonst den Klarnamen.
 * `email`: kam am 2026-08-02 dazu (Audit-Befund, GDPR). `user.created` legte
 * die Adresse des ANGELEGTEN Kontos dauerhaft ab; die Route tut das nicht mehr,
 * aber Bestands-Zeilen tragen sie noch — und ohne diesen Griff überlebte die
 * Adresse `deleteUserCompletely` als Klartext.
 *
 * Bewusst eine feste Feldliste und kein Heuristik-Scan: was pseudonymisiert
 * wird, muss man nachlesen können. Ein NEUES personenbezogenes metadata-Feld
 * gehört hier hinein — oder besser gar nicht erst ins Protokoll.
 */
const PERSONAL_METADATA_FIELDS = ['name', 'email'] as const

export function stripPersonalMetadata(metadata: string): string {
  if (!metadata) return ''
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    if (!PERSONAL_METADATA_FIELDS.some(field => field in parsed)) return metadata
    // Neu aufbauen statt löschen: die Feldnamen kommen aus einer Konstanten,
    // aber `delete obj[variable]` ist im Projekt per ESLint verboten (und die
    // Reihenfolge der verbleibenden Schlüssel bleibt so nachweislich erhalten —
    // daran hängt der Idempotenz-Vergleich mit dem alten String).
    const kept = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => !(PERSONAL_METADATA_FIELDS as readonly string[]).includes(key)),
    )
    return Object.keys(kept).length ? JSON.stringify(kept) : ''
  }
  catch {
    // kein valides JSON → sicherheitshalber komplett leeren
    return ''
  }
}

export async function systemDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  let deleted = 0
  let anonymized = 0

  // Notifications als Empfänger → Hard-Delete. STRIKT: ein Fehler hier muss
  // die Löschung stoppen (deleteUserCompletely gated users.delete auf
  // Voll-Erfolg — ein geschluckter Fehler würde Erfolg melden, obwohl
  // Empfänger-Rows überleben).
  const received = await listAllRows<NotificationRow>(tablesDB, databaseId, NOTIFICATIONS, [Query.equal('recipientId', userId)])
  // Notifications als Verursacher → Hard-Delete. NUR dieser Query darf
  // degradieren: vor Migration 008 fehlt die senderId-Spalte (akzeptierte
  // E8-Lücke) → wie leere Menge behandeln.
  const sent = await listAllRows<NotificationRow>(tablesDB, databaseId, NOTIFICATIONS, [Query.equal('senderId', userId)])
    .catch(() => [] as NotificationRow[])
  const notificationRows = new Map<string, NotificationRow>()
  for (const row of [...received, ...sent]) notificationRows.set(row.$id, row)
  for (const row of notificationRows.values()) {
    await tablesDB.deleteRow({ databaseId, tableId: NOTIFICATIONS, rowId: row.$id })
    deleted++
  }

  // Activity-Feed-Einträge als Verursacher → Hard-Delete. Nur der LIST-Query
  // degradiert (Table fehlt vor Migration 014 → leere Menge); die Deletes
  // selbst bleiben strikt — ein Fehler muss die Löschung stoppen.
  const activities = await listAllRows<ActivityRow>(tablesDB, databaseId, ACTIVITIES, [Query.equal('actorId', userId)])
    .catch(() => [] as ActivityRow[])
  for (const row of activities) {
    await tablesDB.deleteRow({ databaseId, tableId: ACTIVITIES, rowId: row.$id })
    deleted++
  }

  // Handles über ALLE Communities und BEIDE Status → Hard-Delete (Begründung
  // und die bewusst hingenommene Folge stehen im Kopf dieser Datei). Nur der
  // LIST-Query degradiert (Table fehlt vor Migration 029); die Deletes bleiben
  // strikt, sonst meldete die Löschung Erfolg, während der Name überlebt.
  const handles = await listAllRows<HandleRow>(tablesDB, databaseId, HANDLES, [Query.equal('userId', userId)])
    .catch(() => [] as HandleRow[])
  for (const row of handles) {
    await tablesDB.deleteRow({ databaseId, tableId: HANDLES, rowId: row.$id })
    deleted++
  }

  // Audit-Logs: Actor-Pseudonymisierung (Name, IP, personenbezogene metadata)
  const asActor = await listAllRows<AuditRow>(tablesDB, databaseId, AUDIT_LOGS, [Query.equal('actorId', userId)])
  for (const row of asActor) {
    const nextMetadata = stripPersonalMetadata(row.metadata)
    if (row.actorName === '' && row.ip === '' && nextMetadata === row.metadata) continue // idempotent: schon sauber
    await tablesDB.updateRow({
      databaseId,
      tableId: AUDIT_LOGS,
      rowId: row.$id,
      data: { actorName: '', ip: '', metadata: nextMetadata },
    })
    anonymized++
  }

  // Audit-Logs, die auf den User ZEIGEN: targetName + personenbezogene metadata.
  //
  // Die metadata-Hälfte kam am 2026-08-02 dazu (Audit-Befund, GDPR): `user.created`
  // legte die E-MAIL des angelegten Kontos ab — und die steht in der Zeile des
  // ANLEGENDEN Admins, nicht in einer eigenen. Der Actor-Zweig oben griff sie
  // deshalb nie; sie überlebte die Löschung als Klartext. Die Route speichert
  // sie nicht mehr, dieser Griff räumt den Bestand.
  const asTarget = await listAllRows<AuditRow>(tablesDB, databaseId, AUDIT_LOGS, [Query.equal('targetId', userId)])
  for (const row of asTarget) {
    const nextMetadata = stripPersonalMetadata(row.metadata)
    if (row.targetName === '' && nextMetadata === row.metadata) continue // idempotent
    await tablesDB.updateRow({ databaseId, tableId: AUDIT_LOGS, rowId: row.$id, data: { targetName: '', metadata: nextMetadata } })
    anonymized++
  }

  return { deleted, anonymized }
}

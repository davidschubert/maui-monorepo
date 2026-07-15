import { ID, Permission, Query, Role } from 'node-appwrite'
import type { H3Event } from 'h3'

/** Table-Id des Activity-Streams (Schema: system-Migration 014). */
const ACTIVITIES_TABLE = 'activities'

/** Obergrenze der metadata-Spalte (Migration 014) — größere Payloads werden verworfen. */
const METADATA_MAX = 2000

export interface ActivityInput {
  /** Verursacher (User-$id) — GDPR-Löschung findet Einträge hierüber. */
  actorId: string
  /** Klarname zum Anzeigezeitpunkt (Snapshot, wie comments.authorName). */
  actorName: string
  /**
   * Ereignis-Typ, z. B. 'comment.created' — der Konsument (packages/feed)
   * übersetzt via i18n-Key `feed.types.<type>`. KEINE fertigen Sätze
   * speichern (Locale-Wechsel wirkt so rückwirkend, bewusste Abweichung
   * von notify()).
   */
  type: string
  /** Art des betroffenen Objekts, z. B. 'comment' */
  objectType: string
  /** $id des betroffenen Objekts */
  objectId: string
  /** Interner Ziel-Link (wird beim Rendern gegen Open-Redirect geguardet) */
  link: string
  /**
   * Kleine, JSON-serialisierbare Zusatzdaten für den i18n-Text (z. B.
   * { snippet: '…' }). Kein Freitext-Dump — die Spalte ist bewusst klein.
   */
  metadata?: Record<string, unknown>
}

/**
 * Schreibt einen Eintrag in den Activity-Feed (`activities`, system-Eigentum).
 * Best-effort: wirft NIE — ein fehlgeschlagener Feed-Eintrag darf den
 * auslösenden Request (z. B. das Erstellen eines Kommentars) nicht scheitern
 * lassen. Feature-Layer rufen diesen Vertrag auf, statt selbst auf die Tabelle
 * zuzugreifen (kein Cross-Layer-String-Coupling, CONCEPT A14) — die UI-Welt
 * dazu liefert packages/feed.
 *
 * Sichtbarkeit: v1 immer 'members' (read für Role.users()). Der Spaltenwert
 * 'public' ist im Schema vorgesehen, wird aber bewusst NICHT verdrahtet (v2).
 */
export async function recordActivity(event: H3Event, input: ActivityInput): Promise<void> {
  try {
    const metadata = input.metadata ? JSON.stringify(input.metadata) : ''
    // Zu große Payloads verwerfen statt abschneiden (abgeschnittenes JSON
    // wäre unparsebar) — der Feed-Eintrag bleibt ohne Zusatzdaten nutzbar.
    const safeMetadata = metadata.length > METADATA_MAX ? '' : metadata

    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    await tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: ACTIVITIES_TABLE,
      rowId: ID.unique(),
      data: {
        actorId: input.actorId,
        actorName: input.actorName,
        type: input.type,
        objectType: input.objectType,
        objectId: input.objectId,
        link: input.link,
        metadata: safeMetadata,
        visibility: 'members',
      },
      // Row-Security: eingeloggte User lesen; verwaltet (gelöscht) wird
      // server-seitig via Admin-Client (feed.manage-Route bzw. GDPR).
      permissions: [
        Permission.read(Role.users()),
      ],
    })
  }
  catch {
    // best-effort — der auslösende Vorgang ist bereits passiert
  }
}

/**
 * Entfernt alle Feed-Einträge zu einem Objekt — das Gegenstück zu
 * recordActivity() für Moderations-/Lösch-Cascades: wegmoderierte Inhalte
 * dürfen nicht als metadata-Snippet im Activity-Feed weiterleben. Braucht
 * den Composite-Index idx_object (system-017). Best-effort wie
 * recordActivity, aber LAUT — ein liegengebliebener Eintrag ist ein
 * Inhalts-Leak, kein Kosmetikproblem. Ein späteres Restore erzeugt bewusst
 * KEINEN neuen Eintrag (der Feed ist ein Ereignis-Log, kein Index).
 */
export async function removeActivitiesForObject(
  event: H3Event,
  input: { objectType: string, objectId: string },
): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    // Pro Objekt existieren höchstens eine Handvoll Einträge (created/…) —
    // die Schleife ist nur ein Sicherheitsnetz, kein Pagination-Anspruch.
    for (let page = 0; page < 10; page++) {
      const res = await tablesDB.listRows({
        databaseId: config.public.appwriteDatabaseId,
        tableId: ACTIVITIES_TABLE,
        queries: [
          Query.equal('objectType', input.objectType),
          Query.equal('objectId', input.objectId),
          Query.limit(25),
        ],
      })
      if (res.rows.length === 0) return
      await Promise.all(res.rows.map(row => tablesDB.deleteRow({
        databaseId: config.public.appwriteDatabaseId,
        tableId: ACTIVITIES_TABLE,
        rowId: row.$id,
      })))
      if (res.rows.length < 25) return
    }
  }
  catch (error) {
    console.error(`[core] Activity-Cleanup für ${input.objectType} ${input.objectId} fehlgeschlagen — Einträge können im Feed sichtbar bleiben:`, error)
  }
}

/** Zählerstände, die einen Meilenstein-Eintrag auslösen. */
export const MILESTONE_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const

/**
 * Meilenstein in den Feed („Die Community hat 100 Mitglieder!") — Actor ist
 * 'system' (kein User; die GDPR-Löschung per actorId trifft ihn nie, die UI
 * rendert ein Konfetti-Icon statt Avatar). Best-effort wie recordActivity.
 * Race-Fenster akzeptiert (v1): zwei zeitgleiche Trigger könnten denselben
 * Meilenstein doppelt melden — objectId hält ihn für spätere Dedupe fest.
 */
export async function maybeRecordMilestone(
  event: H3Event,
  input: { type: 'milestone.members' | 'milestone.comments' | 'milestone.posts', count: number, link?: string },
): Promise<void> {
  if (!(MILESTONE_STEPS as readonly number[]).includes(input.count)) return
  await recordActivity(event, {
    actorId: 'system',
    actorName: '',
    type: input.type,
    objectType: 'milestone',
    objectId: `${input.type}:${input.count}`,
    link: input.link ?? '/',
    metadata: { count: input.count },
  })
}

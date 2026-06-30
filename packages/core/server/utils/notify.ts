import { ID, Permission, Role } from 'node-appwrite'
import type { H3Event } from 'h3'

export interface NotifyInput {
  /** Empfänger (User-$id) — bekommt Read/Update-Permission auf die Row */
  recipientId: string
  /** Notification-Typ, z. B. 'reply' (Konsument definiert den Katalog) */
  type: string
  title: string
  body: string
  /** Interner Ziel-Link (wird beim Rendern gegen Open-Redirect geguardet) */
  link: string
}

/**
 * Erzeugt eine In-App-Benachrichtigung in der `notifications`-Tabelle (Core-
 * Eigentum). Best-effort: wirft NIE — eine fehlgeschlagene Notification darf den
 * auslösenden Request (z. B. das Erstellen eines Kommentars) nicht scheitern
 * lassen. Feature-Layer rufen diesen Vertrag auf, statt selbst auf die Tabelle
 * zuzugreifen (kein Cross-Layer-String-Coupling, CONCEPT A14).
 */
export async function notify(event: H3Event, input: NotifyInput): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    await tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'notifications',
      rowId: ID.unique(),
      data: {
        recipientId: input.recipientId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        read: false,
      },
      // Row-Security: nur der Empfänger darf lesen + als gelesen markieren
      permissions: [
        Permission.read(Role.user(input.recipientId)),
        Permission.update(Role.user(input.recipientId)),
      ],
    })
  }
  catch {
    // best-effort — der auslösende Vorgang ist bereits passiert
  }
}

import { ID, Permission, Role } from 'node-appwrite'
import type { H3Event } from 'h3'
import { type NotifyScope, notificationScopeValue } from '../../shared/notificationScope'
import { useTenant } from './tenant'

export interface NotifyInput {
  /** Empfänger (User-$id) — bekommt Read/Update-Permission auf die Row */
  recipientId: string
  /** Notification-Typ, z. B. 'reply' (Konsument definiert den Katalog) */
  type: string
  title: string
  body: string
  /** Interner Ziel-Link (wird beim Rendern gegen Open-Redirect geguardet) */
  link: string
  /**
   * WOHIN die Meldung gehört — PFLICHTFELD, bewusst ohne Default (Davids
   * Entscheidung 3, 2026-07-29). 'tenant' = in die Community, in der der
   * Vorgang passiert ist; 'account' = in den Kundenbereich (Vertrag:
   * Zahlungsproblem, Early-Access-Anfrage).
   *
   * WARUM PFLICHT: ein Default hieße raten. Ein billing-Hinweis mit
   * Community-Stempel landet in der Glocke von Mitgliedern, die er nichts
   * angeht — ein Fehler, der wie ein vergessenes Feld aussieht. So erzwingt der
   * Typ die Entscheidung an JEDER Aufrufstelle, auch an künftigen und auch in
   * `server/utils/**`, wo der ESLint-Backstop nicht greift (dort saßen die
   * letzten drei Mandanten-Lecks).
   */
  scope: NotifyScope
  /**
   * Verursacher (User-$id) — Klarname/Snippet stecken in title/body; ohne
   * diesen Schlüssel könnte die GDPR-Löschung verursachte Notifications
   * nicht finden (system-Contributor löscht per senderId, Migration 008).
   */
  senderId?: string
}

/**
 * Erzeugt eine In-App-Benachrichtigung in der `notifications`-Tabelle (Core-
 * Eigentum). Best-effort: wirft NIE — eine fehlgeschlagene Notification darf den
 * auslösenden Request (z. B. das Erstellen eines Kommentars) nicht scheitern
 * lassen. Produkt-Layer rufen diesen Vertrag auf, statt selbst auf die Tabelle
 * zuzugreifen (kein Cross-Layer-String-Coupling, CONCEPT A14).
 *
 * MANDANT (C15, Audit S6): `tenantId` (system-022) ist hier ein ABLAGE-Merkmal,
 * kein Zugriffsschutz — den machen die Row-Permissions (nur der Empfänger darf
 * lesen). Der Stempel entscheidet, in WELCHER Glocke die Meldung erscheint;
 * ohne ihn sah ein Mitglied zweier Communities auf beiden Hosts eine gemischte
 * Liste, mit Links auf Pfade, die es dort nicht gibt. Die Regel selbst ist pure
 * und steht in shared/notificationScope.ts — hier wird sie nur angewandt.
 *
 * NICHT über die Datentür (`tenantDb`): die setzt Publikums-Permissions
 * (`read('members')`), Notifications brauchen aber Empfänger-Permissions — und
 * sie kann „bewusst mandantenlos" nicht ausdrücken, weil sie immer den
 * Mandanten des Requests stempelt.
 */
export async function notify(event: H3Event, input: NotifyInput): Promise<void> {
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const tenant = useTenant(event)
    const tenantId = notificationScopeValue(input.scope, tenant?.mode === 'pool' ? tenant.tenantId : null)

    const data = {
      recipientId: input.recipientId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      read: false,
      // nur mitschreiben, wenn gesetzt — Aufrufe ohne senderId bleiben so
      // auch auf Instanzen VOR Migration system-008 funktionsfähig
      ...(input.senderId ? { senderId: input.senderId } : {}),
    }

    const create = (payload: Record<string, unknown>) => tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'notifications',
      rowId: ID.unique(),
      data: payload,
      // Row-Security: nur der Empfänger darf lesen + als gelesen markieren
      permissions: [
        Permission.read(Role.user(input.recipientId)),
        Permission.update(Role.user(input.recipientId)),
      ],
    })

    // Rückfall OHNE Stempel, falls system-022 auf dieser Instanz noch fehlt:
    // Appwrite lehnt unbekannte Spalten ab, ein stiller Totalausfall der
    // Benachrichtigungen im Deploy-Fenster wäre also die Folge — schlimmer als
    // eine Zeile ohne Ablage-Merkmal (die zählt als Bestandszeile und bleibt
    // sichtbar). LAUT geloggt, damit es kein Dauerzustand wird; dieselbe
    // Begründung wie der Lese-Rückfall in server/utils/notificationScope.ts.
    await create({ ...data, tenantId }).catch(async (error: unknown) => {
      console.warn('[core] Notification mit tenantId fehlgeschlagen — Rückfall ohne Stempel (system-022 fehlt?):', error)
      return await create(data)
    })

    // E-Mail-Zweig (Opt-in, Modus 'instant') — eigener best-effort-Pfad;
    // 'digest' sammelt der Sweep (server/plugins/email-digest.ts) ein.
    await maybeSendInstantEmail(event, input)
  }
  catch {
    // best-effort — der auslösende Vorgang ist bereits passiert
  }
}

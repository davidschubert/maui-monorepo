import { Query, type Models } from 'node-appwrite'
import { communityIdsNeedingHost } from '../../shared/notificationLinks'
import { resolveCommunityHosts } from './communityHost'

/**
 * Digest-Sweep (Modus 'digest'): sammelt UNGELESENE Notifications, gruppiert
 * nach Empfänger, und schickt jedem Opt-in-User mit NEUEN Einträgen seit dem
 * letzten Digest (prefs.emailDigestLastAt, mind. DIGEST_MIN_INTERVAL Abstand)
 * EINE Sammel-Mail. Kandidaten kommen aus der notifications-Tabelle selbst —
 * kein Scan über alle User (prefs sind nicht queryable).
 *
 * Läuft ohne Request-Kontext (createAdminClient(undefined)) — Aufrufer sind
 * der Intervall-Plugin (server/plugins/email-digest.ts) und die manuelle
 * Ops-Route (POST /api/notifications/run-digest).
 *
 * MANDANTENÜBERGREIFEND, BEWUSST (C15): der Sweep liest `read=false` ohne
 * tenantId-Filter. Das ist die dokumentierte Sweep-Ausnahme (CLAUDE.md) und
 * hier auch fachlich richtig — ein Nutzer bekommt EINE Sammel-Mail pro Tag,
 * nicht eine pro Community. Der Stempel aus system-022 stört ihn nicht: er
 * gruppiert nach `recipientId` und liest die Spalte gar nicht.
 *
 * MANDANTENRICHTIGE LINKS (D5, 2026-08-01) — genau deshalb bündelt der Sweep
 * die Host-Auflösung EINMAL, vor der Empfänger-Schleife: der Ablage-Wert jeder
 * Zeile geht durch `resolveCommunityHosts()` (core-Vertrag, Implementierung im
 * control-Layer), und die fertige Karte reist in JEDE Mail. Pro Eintrag wird
 * daraus die Basis gewählt — eine Sammel-Mail kann Links in zwei Communities
 * UND in den Kundenbereich tragen, weil sie bewusst mandantenübergreifend ist.
 *
 * Warum vor der Schleife und nicht je Mail: der Sweep sieht bis zu 2000 Zeilen,
 * aber nur eine Handvoll verschiedener Communities. Ein Aufruf je Mail wäre die
 * N+1-Falle über Projektgrenzen; der Resolver cacht zwar (60 s), aber ein
 * Aufruf im Voraus ist ehrlicher als ein Cache, auf den man sich verlässt.
 * Fällt die Auflösung aus, bleibt die Karte leer und die Links sind wie vor D5
 * — die Mail geht IMMER raus.
 */

// Täglicher Rhythmus mit Toleranz: 20h statt 24h, damit der Digest nicht
// durch Sweep-Versatz jeden Tag später rutscht.
const DIGEST_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000
// Fenster gegen Entgleisen: mehr als 2000 ungelesene Notifications pro Lauf
// bearbeitet der nächste Sweep (Log macht es sichtbar).
const SWEEP_WINDOW = 2000
// Max. Einträge pro Mail — der Rest steht in der Bell
const DIGEST_MAX_ITEMS = 20

type NotificationRow = Models.Row & {
  recipientId: string
  type: string
  title: string
  body: string
  link: string
  read: boolean
  /** Ablage-Ebene (system-025): `<communityId>` · `_account` · `''`.
   *  Optional, weil Bestandszeilen die Spalte nicht tragen. */
  communityId?: string
}

export interface DigestSweepResult {
  candidates: number
  sent: number
  skipped: number
  errors: number
}

let sweepRunning = false

export async function runEmailDigestSweep(): Promise<DigestSweepResult> {
  const result: DigestSweepResult = { candidates: 0, sent: 0, skipped: 0, errors: 0 }
  // Reentranz-Guard (Single-Instanz, wie rate-limit dokumentiert): Plugin-
  // Intervall und manuelle Route dürfen sich nicht überlappen.
  if (sweepRunning || !isMailerConfigured(undefined)) return result
  sweepRunning = true
  try {
    const config = useRuntimeConfig()
    const admin = createAdminClient()
    const databaseId = config.public.appwriteDatabaseId

    const unread = await admin.tablesDB.listRows<NotificationRow>({
      databaseId,
      tableId: 'notifications',
      queries: [
        Query.equal('read', false),
        Query.orderDesc('$createdAt'),
        Query.limit(SWEEP_WINDOW),
      ],
    })
    if (unread.total > unread.rows.length) {
      console.warn(`[core] Digest-Sweep: ${unread.total} ungelesene Notifications, Fenster ${SWEEP_WINDOW} — Rest im nächsten Lauf`)
    }

    const byRecipient = new Map<string, NotificationRow[]>()
    for (const row of unread.rows) {
      const list = byRecipient.get(row.recipientId) ?? []
      list.push(row)
      byRecipient.set(row.recipientId, list)
    }
    result.candidates = byRecipient.size

    // Hosts EINMAL für den ganzen Lauf auflösen (D5) — siehe Kopf. Leere Karte
    // bei Silo/ohne Resolver/Fehler; dann greift die App-Basis wie bisher.
    const appBase = (config.public.appUrl || '').replace(/\/+$/, '')
    const hosts = await resolveCommunityHosts(communityIdsNeedingHost(unread.rows))

    for (const [recipientId, rows] of byRecipient) {
      try {
        const recipient = await admin.users.get({ userId: recipientId }).catch(() => null)
        if (!recipient?.email) { result.skipped++; continue }
        // Spam-Schutz: nur verifizierte Adressen (wie der Instant-Zweig)
        if (!recipient.emailVerification) { result.skipped++; continue }
        const prefs = resolveEmailPrefs(recipient.prefs as Record<string, unknown>)
        if (prefs.emailNotifications !== 'digest') { result.skipped++; continue }

        const lastAt = prefs.emailDigestLastAt ? Date.parse(prefs.emailDigestLastAt) : 0
        if (lastAt && Date.now() - lastAt < DIGEST_MIN_INTERVAL_MS) { result.skipped++; continue }
        // Nur NEUE Einträge seit dem letzten Digest — sonst wiederholt sich
        // eine liegengebliebene ungelesene Notification in jeder Mail.
        const fresh = rows.filter(row => Date.parse(row.$createdAt) > lastAt)
        if (fresh.length === 0) { result.skipped++; continue }

        const mail = buildDigestEmail({ appBase, hosts }, prefs.emailLocale, fresh.slice(0, DIGEST_MAX_ITEMS))
        await sendMail(undefined, { ...mail, to: recipient.email })
        // Marker NACH dem Versand — prefs mergen (updatePrefs ERSETZT alles)
        await admin.users.updatePrefs({
          userId: recipientId,
          prefs: { ...recipient.prefs, emailDigestLastAt: new Date().toISOString() },
        })
        result.sent++
      }
      catch (error) {
        result.errors++
        console.error(`[core] Digest-Mail für ${recipientId} fehlgeschlagen:`, error)
      }
    }
    return result
  }
  finally {
    sweepRunning = false
  }
}

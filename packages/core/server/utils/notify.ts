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
  /**
   * Ablage-Wert EXPLIZIT setzen, statt ihn aus dem Request abzuleiten — nur mit
   * `scope: 'tenant'` wirksam. Erwartet dieselbe Zahl, die `scopeRowFor()`
   * stempelt: `communities.tenantId` (z. B. `t-kunde-a`), NICHT `communities.$id`
   * (dieselbe Falle, die im Kopf von server/utils/communityHost.ts steht).
   *
   * WOFÜR: ein SWEEP hat keinen Request und damit keinen Mandanten-Kontext. Der
   * erste Konsument ist die Zahlungswarnung eines Community-Abos — sie entsteht
   * im Intervall-Plugin der Platform-App und weiß aus der Community-Zeile, in
   * WESSEN Glocke sie gehört, während `useTenant()` dort nichts liefern könnte.
   * Ohne dieses Feld hätte die Meldung den Stempel `''` bekommen und wäre
   * fail-open in JEDER Glocke ihres Empfängers erschienen.
   */
  communityId?: string
  /**
   * IDEMPOTENZ-SCHLÜSSEL: die Row-Id, unter der diese Meldung entsteht. Zweimal
   * derselbe Schlüssel schreibt GENAU EINE Zeile — der zweite Versuch läuft in
   * Appwrites 409 und ist ein No-op, ohne Glocken-Zeile UND ohne Mail
   * (`created: false`).
   *
   * Ohne dieses Feld gilt weiter `ID.unique()`: eine Antwort auf denselben
   * Kommentar SOLL zweimal melden. Gesetzt wird es dort, wo ein WIEDERHOLTER
   * Lauf denselben Sachverhalt sieht — ein Sweep, der stündlich dieselbe
   * überfällige Zahlung findet. Das ist dieselbe Idempotenz-Quelle wie bei den
   * Migrationen (409 → skip): kein Register, kein „erst nachsehen, dann
   * schreiben" — die Existenz der Zeile IST der Merker, und zwischen Nachsehen
   * und Schreiben passt kein zweiter Lauf.
   */
  rowId?: string
}

export interface NotifyResult {
  /**
   * Ist eine NEUE Zeile entstanden? `false` heißt „nichts geschrieben" — weil
   * der Schlüssel schon vergeben war (Dublette) oder weil der Schreibvorgang
   * fehlschlug. In beiden Fällen ging auch keine Mail raus.
   */
  created: boolean
}

/** Appwrites „gibt es schon" — bei fester `rowId` die einzige Quelle eines 409. */
function isDuplicate(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 409
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
 *
 * OHNE `H3Event` aufrufbar (Sweeps): dann gibt es keinen Mandanten-Kontext, und
 * `scope: 'tenant'` braucht `input.communityId`. Dieselbe Bauart wie
 * `sendMail(undefined, …)` und der Digest-Sweep.
 */
export async function notify(event: H3Event | undefined, input: NotifyInput): Promise<NotifyResult> {
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const tenant = event ? useTenant(event) : null
    // Der explizite Wert schlägt den Request-Kontext — aber NUR für 'tenant';
    // 'account' ist per Definition mandantenlos und darf sich nicht überstimmen
    // lassen (sonst legte ein durchgereichtes Feld eine Vertragssache in eine
    // Community-Glocke — genau der Fehler, den C15 abgestellt hat).
    const scopeTenantId = input.scope === 'tenant' && input.communityId
      ? input.communityId
      : (tenant?.mode === 'pool' ? tenant.tenantId : null)
    const tenantId = notificationScopeValue(input.scope, scopeTenantId)

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

    // EIN Schlüssel für beide Versuche (Stempel + Rückfall): ein zweiter
    // ID.unique() im Rückfall hätte aus einer Dublette zwei Zeilen gemacht.
    const rowId = input.rowId ?? ID.unique()

    const create = (payload: Record<string, unknown>) => tablesDB.createRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'notifications',
      rowId,
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
    // E8-3: die Ablage-Spalte heißt communityId (system-025; tenantId ist mit
    // system-026 gefallen). Semantik unverändert: '' = unbekannt (fail-open),
    // '_account' = mandantenlos — der Backfill hat jede gestempelte Zeile
    // kopiert, Null-Bestand verhält sich auf beiden Spalten identisch.
    //
    // DER 409 WIRD VORHER ABGEFANGEN und ist KEIN Rückfall-Grund: bei fester
    // `rowId` heißt er „diese Meldung steht schon da". Liefe er in den Rückfall,
    // schlüge der zweite Versuch aus demselben Grund fehl — und das Log
    // behauptete eine fehlende Spalte, wo in Wahrheit alles richtig war.
    let duplicate = false
    await create({ ...data, communityId: tenantId }).catch(async (error: unknown) => {
      if (isDuplicate(error)) { duplicate = true; return }
      console.warn('[core] Notification mit Stempel fehlgeschlagen — Rückfall ohne (system-025 fehlt?):', error)
      return await create(data).catch((fallbackError: unknown) => {
        if (isDuplicate(fallbackError)) { duplicate = true; return }
        throw fallbackError
      })
    })
    // Dublette ⇒ auch KEINE Mail. Der Schlüssel schützt beide Kanäle, sonst
    // stünde die Glocken-Zeile einmal da und die Mail käme stündlich neu.
    if (duplicate) return { created: false }

    // E-Mail-Zweig (Opt-in, Modus 'instant') — eigener best-effort-Pfad;
    // 'digest' sammelt der Sweep (server/plugins/email-digest.ts) ein.
    // Der Ablage-Wert reist MIT (D5): er entscheidet, auf welchen Host der
    // Link in der Mail zeigt — dieselbe Zahl, die eine Zeile weiter oben in
    // die Spalte geschrieben wurde, nie eine zweite Rechnung.
    await maybeSendInstantEmail(event, input, tenantId)
    return { created: true }
  }
  catch {
    // best-effort — der auslösende Vorgang ist bereits passiert
    return { created: false }
  }
}

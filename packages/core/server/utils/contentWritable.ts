import type { H3Event } from 'h3'

/**
 * „DARF AN DIESEM ZIEL NOCH GESCHRIEBEN WERDEN?" — als Cross-Layer-Vertrag
 * (F1 Stufe 3, Stück 1).
 *
 * ── Wofür ──────────────────────────────────────────────────────────────────
 * Ein GESCHLOSSENES Discussions-Thema nimmt keine neuen Kommentare mehr an.
 * Die Tatsache „geschlossen" steht auf einer `community_posts`-Zeile, also im
 * posts-Layer; abgewiesen werden muss sie im comments-Layer — und der darf
 * posts nicht kennen (A14). Also derselbe Bau wie bei
 * `registerContentActivityHandler`, `registerReportTarget`,
 * `registerCommunityJoinHandler` und `registerUserDataContributor`: core
 * beschreibt die FRAGE, der besitzende Layer verdrahtet die ANTWORT. `comments`
 * fragt „darf ich an Ziel X vom Typ Y schreiben?" und weiß bis heute nicht,
 * dass es Beiträge gibt, geschweige denn geschlossene.
 *
 * NACH targetType GESCHLÜSSELT, genau wie die Aktivität: die Schreib-Regel
 * gehört dem Layer, dem der Inhalt gehört. Heute meldet nur `posts` den Typ
 * 'post' an.
 *
 * ── Unbekannter Typ heißt JA (fail-open, wie beim Aktivitäts-Vertrag) ───────
 * Ein Kommentar an einem Ziel, für das niemand eine Regel angemeldet hat
 * (Ticket, Kurs-Lektion, Silo-Andockpunkt, fremde Hostseite im Embed), ist
 * völlig in Ordnung. Ein Fehler wäre hier die Sorte Strenge, die jede App ohne
 * posts-Layer beim Kommentieren lahmlegt.
 *
 * ── ABER: EIN FEHLER IM WÄCHTER IST KEIN „JA" (Gegensatz zur Aktivität) ─────
 * Das ist der eine Punkt, an dem dieser Vertrag bewusst ANDERS gebaut ist als
 * `notifyContentActivity`. Dort wird jeder geworfene Fehler geschluckt, weil
 * die Meldung eine NEBENWIRKUNG des Schreibens ist — ein Ausfall kostet einen
 * schiefen Zeitstempel. Hier ist die Antwort die BEDINGUNG des Schreibens: ein
 * Wächter, der bei Störung durchwinkt, ist kein Wächter, sondern eine
 * Attrappe, und „geschlossen" wäre eine Zusage, die bei jedem Schluckauf
 * bricht.
 *
 * Der Einwand dagegen lautet: dann blockiert eine Datenbank-Störung das
 * Kommentieren. Er trägt nicht — der Wächter liest die Beitrags-Zeile aus
 * DERSELBEN Appwrite-Instanz, in die der Kommentar gleich geschrieben werden
 * soll. Wer hier nicht lesen kann, kann eine Zeile weiter ohnehin nicht
 * schreiben; der Fehler kommt also nur früher und mit einer ehrlicheren
 * Meldung. Was der WÄCHTER SELBST als „nicht auffindbar" behandelt (gelöschte
 * Zeile, fremder Mandant), entscheidet er in seiner eigenen Implementierung —
 * dort ist es ein „ja, erlaubt", weil es an einem Ziel ohne Regel nichts zu
 * verbieten gibt.
 *
 * ── Wie eine Ablehnung aussieht ────────────────────────────────────────────
 * Der Wächter WIRFT sie selbst (`createError`), statt `false` zurückzugeben.
 * Grund: nur er kennt den Grund und damit den fachlichen Schlüssel, den der
 * Client lesen soll (`data.code` → `reason` im Envelope, core/server/error.ts).
 * Ein boolescher Rückgabewert zwänge diesen Vertrag, sich einen Fehlertext
 * auszudenken, den er nicht kennt — dieselbe Überlegung wie bei
 * `registerReportTarget`, das umgekehrt genau deshalb einen Boolean liefert
 * (dort gibt es nur einen möglichen Grund).
 */

export interface ContentWriteTarget {
  /** Art des Inhalts, z. B. 'post' — dieselben Werte wie `comments.targetType`. */
  targetType: string
  /** Row-Id des Inhalts. Ob sie zum Mandanten gehört, prüft der WÄCHTER
   *  (über seine Datentür) — diese Registry kennt keine Zeilen. */
  targetId: string
}

/**
 * Wirft, wenn nicht geschrieben werden darf; kehrt sonst still zurück.
 * (Kein Boolean — die Begründung steht im Kopf dieser Datei.)
 */
export type ContentWriteGuard = (event: H3Event, target: ContentWriteTarget) => Promise<void> | void

const guards = new Map<string, ContentWriteGuard>()

/**
 * Eine Schreib-Regel für einen Inhalts-Typ anmelden (Nitro-Plugin des
 * besitzenden Layers). Die zuletzt registrierte gewinnt — ein Deployment hat
 * je Typ EINEN Besitzer, wie bei den meldbaren Zielen.
 */
export function registerContentWriteGuard(targetType: string, guard: ContentWriteGuard): void {
  guards.set(targetType, guard)
}

/** Welche Typen haben in diesem Deployment eine Schreib-Regel? (Diagnose/Tests) */
export function registeredContentWriteGuards(): string[] {
  return [...guards.keys()]
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetContentWriteGuards(): void {
  guards.clear()
}

/**
 * „Darf hier geschrieben werden?" — der EINE Aufruf für Konsumenten.
 *
 * Kein angemeldeter Typ ⇒ erlaubt. Angemeldeter Typ ⇒ der Wächter entscheidet
 * und wirft im Zweifel; sein Fehler wird UNVERÄNDERT weitergereicht, damit der
 * fachliche Grund beim Client ankommt.
 */
export async function assertContentWritable(
  event: H3Event,
  targetType: string,
  targetId: string,
): Promise<void> {
  if (!targetType || !targetId) return
  const guard = guards.get(targetType)
  if (!guard) return

  await guard(event, { targetType, targetId })
}

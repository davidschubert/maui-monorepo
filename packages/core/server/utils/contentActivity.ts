import type { H3Event } from 'h3'

/**
 * „AN DIESEM INHALT IST ETWAS PASSIERT" — als Cross-Layer-Vertrag (F1 Stufe 2).
 *
 * ── Die Schuld, die das hier begleicht ──────────────────────────────────────
 * Die Topics-Tabelle der Discussions zeigt eine Spalte „Aktivität". In Stufe 1
 * war ihre Quelle `$updatedAt` der Beitrags-Zeile, und das war zweimal falsch:
 *  - eine ANTWORT bewegte sie NICHT (Kommentare liegen im comments-Layer, und
 *    `posts` darf ihn nicht kennen — A14). Ausgerechnet das, was in einem Forum
 *    Aktivität IST, fehlte.
 *  - jede STIMME bewegte sie sehr wohl (`score.post.ts` schreibt die Zähler auf
 *    die Zeile). Ein Daumen hoch sah damit aus wie eine Wortmeldung.
 * Eine Spalte, die das Falsche mitzählt und das Richtige verpasst, ist keine
 * ungenaue Angabe, sondern eine unwahre.
 *
 * ── Warum eine REGISTRY und kein Import ─────────────────────────────────────
 * `comments` müsste sonst `posts` kennen (Tabellen-Id, Spaltenname, Datentür) —
 * genau die implizite Kopplung, die A14 verbietet. Also derselbe Bau wie bei
 * `registerReportTarget`, `registerCommunityJoinHandler` und
 * `registerUserDataContributor`: core beschreibt die FRAGE, der besitzende Layer
 * verdrahtet die ANTWORT. `comments` ruft nur noch „an Ziel X vom Typ Y ist
 * etwas passiert" und weiß bis heute nicht, dass es Beiträge gibt.
 *
 * NACH targetType GESCHLÜSSELT (wie reportTargets, nicht wie communityHost):
 * Aktivität ist keine Deployment-weite Autorität, sondern gehört dem Layer, dem
 * der Inhalt gehört. Heute registriert nur `posts` den Typ 'post'; wenn Termine
 * oder Kurse morgen dasselbe wollen, kommen sie daneben, nicht darüber.
 *
 * ── Unbekannter Typ ist KEIN Fehler (Gegensatz zu reportTargets) ────────────
 * Dort ist ein unregistrierter Typ ein 400, weil ein Melde-Knopf ohne Queue ein
 * Versprechen ins Leere ist. Hier ist es umgekehrt: ein Kommentar an einem Ziel,
 * das keine Aktivitäts-Spalte führt (Ticket, Kurs-Lektion, Silo-Andockpunkt),
 * ist völlig in Ordnung — es gibt schlicht nichts nachzuziehen. Ein Fehler wäre
 * hier die Sorte Strenge, die jede App ohne posts-Layer beim Kommentieren
 * lahmlegt.
 *
 * ── WIRFT NIE ───────────────────────────────────────────────────────────────
 * Ein kaputter Handler darf keinen Kommentar verhindern. Dieselbe Regel wie bei
 * `notify()` und `recordActivity()`, und aus demselben Grund: die Meldung ist
 * eine NEBENWIRKUNG des Schreibens, nicht sein Zweck. Ein Ausfall kostet einen
 * falschen Zeitstempel in einer Listenspalte — ein geworfener Fehler kostet den
 * Beitrag eines Menschen.
 */

export interface ContentActivityInput {
  /** Art des Inhalts, z. B. 'post' — dieselben Werte wie `comments.targetType`. */
  targetType: string
  /** Row-Id des Inhalts. Ob sie zum Mandanten gehört, prüft der HANDLER
   *  (über seine Datentür) — diese Registry kennt keine Zeilen. */
  targetId: string
  /** Zeitpunkt der Aktivität als ISO-String. Kommt von hier und nicht vom
   *  Handler, damit alle Konsumenten desselben Ereignisses denselben Wert
   *  schreiben. */
  at: string
}

export type ContentActivityHandler = (
  event: H3Event,
  input: ContentActivityInput,
) => Promise<void> | void

const handlers = new Map<string, ContentActivityHandler>()

/**
 * Einen Inhalts-Typ anmelden (Nitro-Plugin des besitzenden Layers).
 * Die zuletzt registrierte Funktion gewinnt — ein Deployment hat je Typ EINEN
 * Besitzer, genau wie bei den meldbaren Zielen.
 */
export function registerContentActivityHandler(targetType: string, handler: ContentActivityHandler): void {
  handlers.set(targetType, handler)
}

/** Welche Typen ziehen in diesem Deployment eine Aktivität nach? (Diagnose/Tests) */
export function registeredContentActivityTypes(): string[] {
  return [...handlers.keys()]
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetContentActivityHandlers(): void {
  handlers.clear()
}

/**
 * „An diesem Inhalt ist etwas passiert" — der EINE Aufruf für Konsumenten.
 *
 * Best-effort und still: unbekannter Typ ⇒ nichts zu tun (kein Log, das wäre
 * bei jedem Ticket-Kommentar eine Zeile Rauschen); geworfener Handler ⇒ EIN
 * Log-Eintrag, damit ein dauerhaft kaputter Nachzieher nicht unsichtbar bleibt,
 * und der Aufrufer läuft weiter.
 */
export async function notifyContentActivity(
  event: H3Event,
  targetType: string,
  targetId: string,
  at: string = new Date().toISOString(),
): Promise<void> {
  if (!targetType || !targetId) return
  const handler = handlers.get(targetType)
  if (!handler) return

  try {
    await handler(event, { targetType, targetId, at })
  }
  catch (error) {
    logEvent('warn', 'content.activity_failed', {
      targetType,
      targetId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

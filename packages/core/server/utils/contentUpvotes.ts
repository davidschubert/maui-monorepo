import type { H3Event } from 'h3'

/**
 * „DIESER INHALT HAT JETZT SO VIELE AUFSTIMMEN." (F1 Teilpaket 2,
 * Mehrfach-Verleihung — der achte Cross-Layer-Vertrag.)
 *
 * ── WARUM ES IHN NEBEN DEN ZÄHLERN GIBT ────────────────────────────────────
 * `recordUserCounterEvents` bucht auf einen MENSCHEN („er hat eine Stimme
 * bekommen"). Die Posting-Abzeichen fragen aber nach einem STÜCK („ein Beitrag
 * von dir hat 10 Stimmen"), und Davids Mehrfach-Regel verlangt genau diese
 * Auflösung: verliehen wird je INHALT, der über die Schwelle geht, also braucht
 * die Verleihung die Id des Inhalts. Ein laufender Personen-Zähler kann das
 * nicht hergeben — er weiß nie, welcher Beitrag gerade welche Grenze
 * überschritten hat (dieselbe Begründung, aus der die Schwellen-Zahlen
 * Aggregate geblieben sind).
 *
 * ── WARUM CORE UND NICHT DIREKT ────────────────────────────────────────────
 * Die Stimm-Route von `comments` kennt den Beitrag-Layer nicht und darf ihn
 * nicht kennen (A14). Sie meldet deshalb eine FORM („eine Antwort") und eine
 * Zahl, keinen Nachbarn. Wer daraus ein Abzeichen macht, ist der Layer, dem der
 * Katalog gehört (`posts`) — und ohne ihn (Silo-App, Playground) ist alles hier
 * ein No-op.
 *
 * ── WIRFT NIE ──────────────────────────────────────────────────────────────
 * Eine Verleihung ist eine Nebenwirkung des Stimmens, kein Teil davon. Niemandes
 * Stimme darf verloren gehen, weil ein Abzeichen nicht angelegt werden konnte;
 * verpasste Meldungen holt das Netz beim Hinsehen nach (badges.get.ts).
 */

/**
 * Die FORM des Inhalts, nicht der Layer, der ihn führt — dieselbe
 * Unterscheidung wie bei `counterLikedTopics`/`counterLikedReplies`: ein Beitrag
 * steht für sich, eine Antwort hängt unter etwas.
 */
export const CONTENT_UPVOTE_KINDS = ['topic', 'reply'] as const
export type ContentUpvoteKind = (typeof CONTENT_UPVOTE_KINDS)[number]

export interface ContentUpvoteReport {
  /** WEM der Inhalt gehört. Leer (Gast-Kommentar) ⇒ die Meldung verfällt. */
  authorId: string
  /** Row-Id des Inhalts — sie wird zum Merkmal der Verleihung. */
  contentId: string
  kind: ContentUpvoteKind
  /** Der NEUE Gesamtstand der Aufstimmen, nicht die Änderung. */
  upvotes: number
  /**
   * Der Stand VOR dieser Stimme — damit der Empfänger die Differenz bilden kann.
   *
   * Ohne ihn müsste jede weitere Stimme auf einem beliebten Beitrag alle
   * erreichten Schwellen erneut verleihen und in den Unique-Index laufen: drei
   * Schreibversuche je Stimme, dauerhaft, für nichts. Ein fehlender Wert wird
   * als 0 gelesen — dann verhält sich die Meldung wie vor der Optimierung
   * (idempotent, nur teurer).
   */
  previousUpvotes?: number
}

export type ContentUpvoteHandler = (
  event: H3Event,
  report: ContentUpvoteReport,
) => Promise<void> | void

let handler: ContentUpvoteHandler | null = null

/** Von dem Layer registriert, dem der Abzeichen-Katalog gehört (Nitro-Plugin). */
export function registerContentUpvoteHandler(fn: ContentUpvoteHandler): void {
  if (handler) {
    console.warn('[core] registerContentUpvoteHandler: bestehender Empfänger wird ersetzt — pro Deployment ist EINER vorgesehen')
  }
  handler = fn
}

export function getContentUpvoteHandler(): ContentUpvoteHandler | null {
  return handler
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetContentUpvoteHandler(): void {
  handler = null
}

/**
 * PURE (unit-getestet): Ist diese Meldung überhaupt etwas wert?
 *
 * Verworfen wird, was keinen Empfänger hat (Gast-Kommentar: `authorId` ist ''),
 * keinen Inhalt benennt oder keine brauchbare Zahl trägt. Eine kaputte Meldung
 * soll nichts bewegen — nicht die Stimme verhindern.
 */
export function contentUpvoteReportable(report: ContentUpvoteReport): boolean {
  if (!report.authorId || !report.contentId) return false
  if (!CONTENT_UPVOTE_KINDS.includes(report.kind)) return false
  return Number.isInteger(report.upvotes) && report.upvotes > 0
}

/**
 * „Sieh nach, ob das ein Abzeichen wert ist." — der EINE Aufruf für Stimm-Routen.
 * Wirft nie.
 *
 * AWAIT, KEIN FEUER-UND-VERGISS: ein nicht abgewartetes Versprechen wird in
 * Nitro mit der Antwort verworfen — die Verleihung wäre dann eine Attrappe, die
 * unter Last stiller wird, je mehr los ist (dieselbe Überlegung wie bei
 * `recordUserCounterEvents`).
 */
export async function reportContentUpvotes(event: H3Event, report: ContentUpvoteReport): Promise<void> {
  if (!contentUpvoteReportable(report)) return

  const receiver = getContentUpvoteHandler()
  if (!receiver) return

  try {
    await receiver(event, report)
  }
  catch (error) {
    logEvent('warn', 'content_upvotes.report_failed', {
      kind: report.kind,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

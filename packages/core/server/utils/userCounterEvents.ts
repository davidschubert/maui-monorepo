import type { H3Event } from 'h3'

/**
 * „DIESER MENSCH HAT GERADE ETWAS GETAN — SCHREIB ES MIT." (F1, das Fundament
 * des gemeinsamen Pakets aus Konzept Teil 5, Punkte 4–6.)
 *
 * ── WARUM ES DIESEN VERTRAG NEBEN `registerUserCounterProvider` GIBT ────────
 * Der Zähl-Vertrag von Stufe 4 fragt beim HINSEHEN: „wie viele meiner Beiträge
 * haben mindestens fünf Stimmen?" — eine feste Zahl von `count`-Abfragen, die
 * jedes Mal neu gerechnet werden. Das trägt eine Galerie, die jemand einmal am
 * Tag öffnet. Es trägt NICHT, was danach kommt:
 *
 *  - **Abzeichen mehrfach verleihen** braucht die Frage „ist seit dem letzten
 *    Mal ein neues qualifizierendes Ereignis dazugekommen?". Aggregate kennen
 *    keine Ereignisse, nur Stände.
 *  - **Benachrichtigen** heißt, im Moment des Verdienstes davon zu wissen —
 *    nicht in dem Moment, in dem der Verdiente zufällig nachsieht.
 *  - **Trust Levels** werden laut Davids Entscheidung „beim Schreiben über die
 *    mitschreibenden Zähler" ausgewertet. Acht `count`-Abfragen an jedem
 *    Kommentar wären genau das, was diese Umstellung vermeiden soll.
 *
 * Deshalb ZWEI Verträge nebeneinander und ausdrücklich keine Ablösung: der
 * Provider-Vertrag beantwortet weiterhin die VERTEILUNGS-Fragen („wie viele
 * meiner Inhalte haben ≥N Stimmen"), die ein laufender Zähler gar nicht
 * beantworten kann — dafür müsste er je Schwelle einen eigenen Stand führen und
 * bei jeder Stimme wissen, welche Schwelle ein einzelner Beitrag gerade
 * überschritten hat. Dieser Vertrag hier zählt EREIGNISSE.
 *
 * ── WER SCHREIBT? EINE AUTORITÄT, UND SIE GEHÖRT NICHT CORE ────────────────
 * Core besitzt keine Tabellen (A14). Die Zähler-Zeilen gehören dem posts-Layer
 * (Discussions-Infrastruktur); core erklärt nur die Frage und nimmt die
 * Meldungen entgegen. Ohne registrierte Autorität ist alles hier ein No-Op —
 * Silo-Apps ohne posts, der Playground und CI-Builds laufen unverändert.
 *
 * ── WIRFT NIE, UND ZWAR AUS PRINZIP ────────────────────────────────────────
 * Ein Zähler ist eine Nebenwirkung des Handelns, kein Teil davon. Niemandes
 * Kommentar darf verloren gehen, weil eine Zahl nicht hochgezählt werden
 * konnte. Der Preis ist ein möglicher Untergang einzelner Ereignisse — genau
 * dafür gibt es den Selbstheilungs-Zweig der Auswertung (siehe
 * `packages/posts/server/utils/memberCounters.ts`).
 */

/**
 * Die Ereignis-Arten. SIE SIND DER VERTRAG — nicht die Spalten einer Tabelle,
 * die nur ein Layer kennt.
 *
 * Der Zuschnitt ist „was ist heute an der QUELLE messbar und wird später
 * gebraucht", nicht „was ließe sich denken":
 *  - `topicsCreated` / `repliesCreated` — die beiden Schreib-Arten. Getrennt,
 *    weil Trust Levels sie getrennt fordern (Discourse: „Themen eröffnet" UND
 *    „Antworten geschrieben") und weil ein zusammengefasster Zähler sich später
 *    nicht mehr aufteilen ließe.
 *  - `upvotesGiven` / `upvotesReceived` — dieselbe Stimme aus zwei Blickwinkeln,
 *    zwei verschiedene Menschen. Ein Zähler für beides wäre sinnlos.
 *  - `edits` — Bearbeitungen EIGENER Inhalte. Der einzige Zähler ohne jedes
 *    Aggregat dahinter: eine Bearbeitung hinterlässt in `community_posts` und
 *    `comments` nur einen Zeitstempel, keine Anzahl. Wer sie nicht mitschreibt,
 *    kann sie nie nachrechnen.
 *
 * NICHT dabei und bewusst nicht: abgesetzte Meldungen. Die beantwortet der
 * moderation-Provider mit EINER exakten `count`-Abfrage über Zeilen, die nie
 * gelöscht werden — ein mitlaufender Zähler wäre dort mehr Bewegung für
 * dieselbe Zahl.
 */
export const USER_COUNTER_KINDS = [
  'topicsCreated',
  'repliesCreated',
  'upvotesGiven',
  'upvotesReceived',
  'edits',
] as const

export type UserCounterKind = (typeof USER_COUNTER_KINDS)[number]

export interface UserCounterEvent {
  /**
   * WEM wird gutgeschrieben. Ausdrücklich mitgegeben und NICHT aus
   * `event.context.user` abgeleitet — die Hälfte aller Meldungen betrifft
   * jemand anderen als den Handelnden (wer eine Stimme bekommt, hat gerade
   * nicht geklickt).
   *
   * Das ist der eine Punkt, an dem dieser Vertrag bewusst anders ist als
   * `collectUserCounters`, das eine userId GAR NICHT annimmt: dort wäre der
   * Parameter eine Auskunftsstelle über fremde Menschen, hier ist er eine
   * Buchung ohne Leseweg. Geschrieben wird nur, gelesen nie.
   */
  userId: string
  kind: UserCounterKind
  /** Ganzzahlig, darf negativ sein (zurückgenommene Stimme). 0 wird verworfen. */
  delta: number
}

export type UserCounterRecorder = (
  event: H3Event,
  events: readonly UserCounterEvent[],
) => Promise<void> | void

let recorder: UserCounterRecorder | null = null

/** Von dem Layer registriert, dem die Zähler-Zeilen gehören (Nitro-Plugin). */
export function registerUserCounterRecorder(fn: UserCounterRecorder): void {
  if (recorder) {
    console.warn('[core] registerUserCounterRecorder: bestehende Autorität wird ersetzt — pro Deployment ist EINE vorgesehen')
  }
  recorder = fn
}

export function getUserCounterRecorder(): UserCounterRecorder | null {
  return recorder
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetUserCounterRecorder(): void {
  recorder = null
}

/**
 * PURE (unit-getestet): Meldungen zusammenfassen — je (Nutzer, Art) EINE Zeile.
 *
 * WOFÜR: eine Stimme meldet zwei Ereignisse, ein Beitrag eines. Die Autorität
 * schreibt je Meldung einen Datenbank-Schritt; ohne diese Zusammenfassung wären
 * zwei Meldungen für denselben Menschen und dieselbe Art zwei Schritte auf
 * DERSELBEN Zeile. Das passiert real: wer seinen eigenen Beitrag hochstimmt,
 * ist Geber UND Empfänger.
 *
 * Verworfen wird, was nicht zählbar ist: leere Ids, unbekannte Arten,
 * nicht-endliche oder gebrochene Deltas und die Summe 0 (nichts zu tun). Eine
 * kaputte Meldung soll nichts bewegen — nicht die ganze Buchung verhindern.
 */
export function mergeUserCounterEvents(events: readonly UserCounterEvent[]): UserCounterEvent[] {
  const known = new Set<string>(USER_COUNTER_KINDS)
  const totals = new Map<string, UserCounterEvent>()

  for (const entry of events) {
    if (!entry?.userId || !known.has(entry.kind)) continue
    if (typeof entry.delta !== 'number' || !Number.isFinite(entry.delta) || !Number.isInteger(entry.delta)) continue
    if (entry.delta === 0) continue

    const key = `${entry.userId} ${entry.kind}`
    const existing = totals.get(key)
    if (existing) existing.delta += entry.delta
    else totals.set(key, { userId: entry.userId, kind: entry.kind, delta: entry.delta })
  }

  return [...totals.values()].filter(entry => entry.delta !== 0)
}

/**
 * „Schreib das mit." — der EINE Aufruf für Quellen. Wirft nie.
 *
 * AWAIT, KEIN FEUER-UND-VERGISS: ein nicht abgewartetes Versprechen wird in
 * Nitro mit der Antwort verworfen, und dann wäre der Zähler eine Attrappe, die
 * unter Last stiller wird, je mehr los ist. Der Preis sind ein bis zwei
 * Datenbank-Schritte an einem Schreibvorgang, der ohnehin mehrere hat.
 */
export async function recordUserCounterEvents(
  event: H3Event,
  events: readonly UserCounterEvent[],
): Promise<void> {
  const merged = mergeUserCounterEvents(events)
  if (merged.length === 0) return

  const authority = getUserCounterRecorder()
  if (!authority) return

  try {
    await authority(event, merged)
  }
  catch (error) {
    logEvent('warn', 'user_counters.record_failed', {
      kinds: merged.map(entry => entry.kind).join(','),
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

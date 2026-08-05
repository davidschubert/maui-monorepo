import type { H3Event } from 'h3'

/**
 * „WAS HAT DIESER MENSCH HIER GETAN, UND WAS HAT ER DAFÜR BEKOMMEN?" — als
 * Cross-Layer-Vertrag (F1 Stufe 4, das Fundament der Abzeichen).
 *
 * ── Die Aufgabe ────────────────────────────────────────────────────────────
 * Davids Zuschnitt für Stufe 4 lautet „nur heute messbare Abzeichen … plus die
 * Ereignis-Zählung je Nutzer als Fundament". Die Zahlen dafür liegen in drei
 * Layern: die vergebenen Stimmen und die eigenen Beiträge kennt `posts`, die
 * Antworten kennt `comments`, die abgesetzten Meldungen kennt `moderation`.
 * Keiner darf die Tabellen der anderen lesen (A14) — also fragt EINER und alle
 * antworten.
 *
 * ── DER SCHLÜSSEL IST DIE QUELLE, DER WERTE-NAME IST DER VERTRAG ───────────
 * Wie `registerUserActivityProvider` (Stufe 3, Stück 4) ist die Registry nach
 * der QUELLE geschlüsselt und nicht nach einem Ziel-Typ: die Frage geht an
 * ALLE, die Antworten werden zusammengeführt.
 *
 * Neu und ausdrücklich anders ist, dass die ZÄHLER-NAMEN hier stehen und nicht
 * beim Konsumenten. Das ist der Punkt, an dem der naheliegende Entwurf ein
 * String-Coupling geworden wäre: Hieße der Zähler nur im Abzeichen-Katalog
 * (posts) `likedReplies:10`, müsste `comments` denselben String erraten — und
 * `posts` müsste wissen, dass es einen Layer namens `comments` gibt, der
 * Antworten führt. Mit den Bauern unten nennt jede Seite einen ZÄHLER, keine
 * fremde Schicht. Fehlt die Quelle (Silo-App ohne `comments`), fehlt der
 * Zähler — das Abzeichen bleibt unverdient, nichts bricht.
 *
 * ── IMMER DER AKTUELLE NUTZER, UND KEIN PARAMETER DAFÜR ────────────────────
 * `collectUserCounters(event)` nimmt bewusst KEINE userId entgegen. Ein
 * Provider zählt, was `event.context.user` getan hat — Punkt. Der Grund ist
 * keine Bequemlichkeit: mit einem userId-Parameter wäre der erste Aufrufer,
 * der ihn aus einem Query-String füllt, eine Auskunftsstelle über fremde
 * Menschen („wie viele Meldungen hat X abgesetzt?"). Ein Parameter, den es
 * nicht gibt, kann nicht falsch belegt werden.
 *
 * ── FAIL-SOFT, UND WARUM DAS HIER SICHER IST ───────────────────────────────
 * Eine werfende Quelle wird übersprungen und protokolliert. Beim
 * Schreib-Wächter (`assertContentWritable`) wäre genau das falsch — dort ist
 * die Antwort die BEDINGUNG eines Schreibvorgangs. Hier ist sie es nicht:
 * ein fehlender Zähler UNTERzählt, und weil ein Abzeichen nie wieder
 * eingezogen wird, kostet eine ausgefallene Quelle höchstens Aufschub bis zur
 * nächsten Auswertung. Zu VIEL kann dabei nie herauskommen.
 */

/** Die Antwort einer Quelle: Zähler-Name → Wert. */
export type UserCounters = Record<string, number>

export interface UserCounterQuery {
  /**
   * Die Upvote-Schwellen, nach denen gefragt wird (z. B. `[1, 2, 5, 10]`).
   *
   * Sie kommen vom KONSUMENTEN, nicht von der Quelle: welche Schwellen zählen,
   * ist Produktwissen (der Abzeichen-Katalog), und eine Quelle, die alle
   * denkbaren Schwellen auf Verdacht zählte, bezahlte dafür mit einer Abfrage
   * je Schwelle.
   */
  thresholds: readonly number[]
  /**
   * Ab wann eigene Inhalte gezählt werden sollen (ISO) — für `contentSince`.
   *
   * OPTIONAL, und das ist der ganze Trick: fehlt das Feld, stellt keine Quelle
   * die Abfrage. Nur der EINE Konsument, der ein Zeitfenster braucht (das
   * Abzeichen „Jahrestag"), setzt es — und auch der nur, wenn die
   * Mitgliedschaft überhaupt lange genug zurückliegt. Alle anderen Aufrufe
   * bleiben so teuer wie vorher.
   *
   * WARUM ÜBERHAUPT HIER UND NICHT AN DER AUSWERTESTELLE: die Frage lautet
   * „hat dieser Mensch im letzten Jahr etwas GESCHRIEBEN?", und geschrieben
   * wird in zwei Layern (Beitrag in `posts`, Antwort in `comments`). Wer sie
   * an der Auswertestelle beantwortet, kann nur die Hälfte messen, die sein
   * eigener Layer kennt — und ein Abzeichen, das „Beitrag" sagt und Antworten
   * übersieht, ist genau der halbe Satz, aus dem heraus „Editor" abgelehnt
   * wurde. Ein optionales Feld an einem Vertrag, den es schon gibt, ist der
   * kleinere Preis als ein zweiter Vertrag daneben.
   */
  since?: string
}

export type UserCounterProvider = (
  event: H3Event,
  query: UserCounterQuery,
) => Promise<UserCounters> | UserCounters

/* ─── Die Zähler-Namen: DER Vertrag zwischen Quelle und Konsument ────────── */

/** Wie viele Upvotes hat der Nutzer VERGEBEN? (alle Inhaltsarten zusammen) */
export const COUNTER_LIKES_GIVEN = 'likesGiven'

/** Wie viele Meldungen hat der Nutzer abgesetzt? */
export const COUNTER_FLAGS_RAISED = 'flagsRaised'

/**
 * Wie viele eigene, sichtbare Inhalte hat der Nutzer seit `query.since`
 * verfasst? (alle Inhaltsarten zusammen)
 *
 * ANTWORTET NUR, WER GEFRAGT WURDE: ohne `since` melden die Quellen diesen
 * Zähler GAR NICHT — und ein fehlender Zähler ist beim Konsumenten 0. Das ist
 * die gutmütige Richtung: ohne Frage kein Abzeichen, nie ein Abzeichen zu viel.
 */
export const COUNTER_CONTENT_SINCE = 'contentSince'

/**
 * Ist das Profil ausgefüllt (Text ÜBER SICH und Bild)? 0 oder 1.
 *
 * Ein Wahrheitswert als Zähler, damit er durch dieselbe Naht passt.
 * Konsumenten lesen ihn als `>= 1` — die Summenbildung unten könnte theoretisch
 * 2 ergeben, wenn zwei Quellen antworten; „mindestens eine sagt ja" ist die
 * gemeinte Frage.
 */
export const COUNTER_PROFILE_COMPLETE = 'profileComplete'

/** Eigene Inhalte JEDER Art mit mindestens `threshold` erhaltenen Upvotes. */
export function counterLikedItems(threshold: number): string {
  return `likedItems:${threshold}`
}

/**
 * Eigene EIGENSTÄNDIGE Beiträge mit mindestens `threshold` Upvotes.
 *
 * „Beitrag" gegen „Antwort" ist eine Unterscheidung über die FORM des Inhalts,
 * nicht über den Layer, der ihn führt — deshalb steht sie hier und nicht in
 * einem Produkt-Layer. Ein Beitrag steht für sich, eine Antwort hängt unter
 * etwas.
 */
export function counterLikedTopics(threshold: number): string {
  return `likedTopics:${threshold}`
}

/** Eigene ANTWORTEN mit mindestens `threshold` Upvotes. */
export function counterLikedReplies(threshold: number): string {
  return `likedReplies:${threshold}`
}

/* ─── Registry ───────────────────────────────────────────────────────────── */

const providers = new Map<string, UserCounterProvider>()

/**
 * Eine Quelle anmelden (Nitro-Plugin des besitzenden Layers). Die Id ist der
 * LAYER, nicht ein Zähler-Name — mehrere Layer tragen zu denselben Zählern bei.
 */
export function registerUserCounterProvider(id: string, provider: UserCounterProvider): void {
  providers.set(id, provider)
}

/** Welche Quellen antworten in diesem Deployment? (Diagnose/Tests) */
export function registeredUserCounterProviders(): string[] {
  return [...providers.keys()]
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetUserCounterProviders(): void {
  providers.clear()
}

/**
 * PURE (unit-getestet): mehrere Antworten zu EINER Zählung addieren.
 *
 * SUMME, weil jeder Zähler additiv gemeint ist: „vergebene Upvotes" ist die
 * Summe über alle Inhaltsarten, „eigene Inhalte mit ≥5" ebenso. Zähler, bei
 * denen eine Summe falsch wäre, gibt es in diesem Vertrag nicht — und darf es
 * nicht geben; wer einen braucht (ein Maximum, einen Durchschnitt), baut einen
 * eigenen Vertrag statt hier eine Ausnahme.
 *
 * Nicht-endliche und negative Werte werden verworfen statt addiert: eine
 * kaputte Quelle soll eine Zählung verkleinern können — nicht ins Absurde
 * ziehen.
 */
export function mergeUserCounters(parts: readonly UserCounters[]): UserCounters {
  const total: UserCounters = {}
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      if (!key || typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
      total[key] = (total[key] ?? 0) + value
    }
  }
  return total
}

/**
 * „Was hat der aktuelle Nutzer getan?" — der EINE Aufruf für Konsumenten.
 *
 * Ohne angemeldeten Nutzer und ohne Quellen: leere Zählung, kein Fehler. Eine
 * App ohne die beitragenden Layer hat schlicht nichts beizutragen.
 */
export async function collectUserCounters(
  event: H3Event,
  query: UserCounterQuery,
): Promise<UserCounters> {
  if (!event.context.user || providers.size === 0) return {}

  const answers = await Promise.all([...providers.entries()].map(async ([id, provider]) => {
    try {
      return await provider(event, query)
    }
    catch (error) {
      logEvent('warn', 'user_counters.provider_failed', {
        provider: id,
        message: error instanceof Error ? error.message : String(error),
      })
      return {} as UserCounters
    }
  }))

  return mergeUserCounters(answers)
}

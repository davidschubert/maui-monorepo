/**
 * Sortierung und Zeitfenster der Topic-Liste (F1 Stufe 1).
 *
 * PURE (unit-getestet): Server (Query-Bau) und Client (Reiter, Links) lesen
 * dieselben Listen — ein Reiter, den der Server nicht kennt, ist damit nicht
 * baubar.
 *
 * WARUM `hot` FEHLT (bewusste Auslassung, nicht Vergessen): „Hot" ist eine
 * Funktion aus Stimmen UND Alter. Ehrlich rechnen lässt sie sich nur auf zwei
 * Wegen — (a) eine gespeicherte Rang-Spalte, die ein Sweep regelmäßig neu
 * rechnet, oder (b) alle in Frage kommenden Zeilen laden und im Speicher
 * ordnen. (a) ist neue Infrastruktur (Spalte + Lauf) und gehört damit
 * ausdrücklich NICHT in Stufe 1; (b) ordnet in Wahrheit nur die Seite, die man
 * ohnehin geholt hat — eine Liste, die sich „Hot" nennt und dabei bloß die
 * neuesten 25 umsortiert, ist ein Etikett ohne Deckung. `latest` und
 * `top` + Zeitraum decken die ehrlichen Fälle vollständig ab.
 */

export const TOPIC_ORDERS = ['latest', 'top', 'categories'] as const
export type TopicOrder = (typeof TOPIC_ORDERS)[number]

export const TOP_PERIODS = ['all', 'year', 'quarter', 'month', 'week', 'today'] as const
export type TopPeriod = (typeof TOP_PERIODS)[number]

export function isTopicOrder(value: unknown): value is TopicOrder {
  return typeof value === 'string' && (TOPIC_ORDERS as readonly string[]).includes(value)
}

export function isTopPeriod(value: unknown): value is TopPeriod {
  return typeof value === 'string' && (TOP_PERIODS as readonly string[]).includes(value)
}

/** Tage je Zeitraum — rollierende Fenster ab „jetzt". */
const PERIOD_DAYS: Record<Exclude<TopPeriod, 'all' | 'today'>, number> = {
  year: 365,
  quarter: 90,
  month: 30,
  week: 7,
}

const DAY_MS = 24 * 3600_000

/**
 * Ab wann zählt ein Beitrag für diesen Zeitraum? `null` = kein Fenster.
 *
 * ZWEI SORTEN FENSTER, mit Absicht: `today` ist ein KALENDERTAG (ab
 * UTC-Mitternacht), alles Übrige ein ROLLIERENDES Fenster ab jetzt. Grund:
 * „Diese Woche" meint umgangssprachlich „in den letzten sieben Tagen", „Heute"
 * dagegen wirklich heute — ein rollierendes 24-h-Fenster würde den gestrigen
 * Abend als „heute" verkaufen.
 *
 * BEKANNTE UNSCHÄRFE: die Grenze liegt bei UTC-Mitternacht, nicht bei der des
 * Betrachters. In Deutschland fallen dadurch die ersten ein bis zwei Stunden
 * nach lokaler Mitternacht noch auf den Vortag. Eine Zeitzone vom Client
 * entgegenzunehmen wäre ein Eingabewert mehr an einer öffentlichen Route,
 * für eine Genauigkeit, die niemand nachmisst.
 */
export function periodStartIso(period: TopPeriod, now: Date = new Date()): string | null {
  if (period === 'all') return null
  if (period === 'today') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  }
  return new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS).toISOString()
}

/**
 * Filter `created-after`: entweder ein Datum (`YYYY-MM-DD`) oder eine
 * Tagesangabe (`7d` = „in den letzten 7 Tagen"). Alles andere ⇒ `null`
 * (Filter wird ignoriert, nie 400 — ein kaputter Query-Parameter soll eine
 * öffentliche Liste nicht abschießen).
 *
 * Obergrenze 3650 Tage: ein `99999999d` würde sonst über den gültigen
 * Datumsbereich hinauslaufen und eine `Invalid Date` in den Query schreiben.
 */
export function createdAfterIso(raw: unknown, now: Date = new Date()): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null

  const days = value.match(/^(\d{1,4})d$/)
  if (days) {
    const n = Number(days[1])
    if (n < 1 || n > 3650) return null
    return new Date(now.getTime() - n * DAY_MS).toISOString()
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed)) return null
  const iso = new Date(parsed).toISOString()
  /**
   * RÜCKRECHNUNG statt bloßem NaN-Test: `Date.parse('2026-02-30T…')` ist in
   * Node NICHT NaN, sondern rollt auf den 2. März weiter (live nachgemessen).
   * Ohne diese Zeile filterte ein Tippfehler stillschweigend nach einem Datum,
   * das niemand eingegeben hat — schlimmer als gar kein Filter, weil das
   * Ergebnis plausibel aussieht.
   */
  return iso.startsWith(`${value}T`) ? iso : null
}

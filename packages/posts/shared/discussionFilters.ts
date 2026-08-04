import { createdAfterIso, dayStartIso } from './discussionSort'

/**
 * Die erweiterten Filter der Themen-Suche (F1 Stufe 3, Konzept § 3.3).
 *
 * PURE (unit-getestet): Server (Query-Bau) und Client (Formular, URL, Zähler
 * der aktiven Filter) lesen dieselbe Regel. Ein Filter, den der Server nicht
 * kennt, ist damit nicht baubar — dasselbe Prinzip wie bei `discussionSort`.
 *
 * ALLES WIRD IGNORIERT STATT ABGELEHNT. Unsinnige Werte ⇒ Standard, nie 400.
 * Das hier ist eine öffentliche Liste, und ein vertippter Parameter in einem
 * geteilten Link soll eine leere Seite nicht in einen Fehler verwandeln.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WAS AUS DAVIDS KATALOG BEWUSST FEHLT — und warum
 * ════════════════════════════════════════════════════════════════════════════
 * Der Katalog in § 3.3 ist von Discourse abgeschrieben. Sechs seiner Kästchen
 * sind hier NICHT gebaut. Keines davon ist vergessen; jedes einzelne wäre
 * entweder wirkungslos oder unehrlich. Dieselbe Klausel hat bei „Hot"
 * (Stufe 1) schon einmal die richtige Entscheidung getragen.
 *
 * 1. „are the very first post" — WIRKUNGSLOS. Unsere Suche durchsucht
 *    ausschließlich Themen (`community_posts`), nie Antworten. Jeder Treffer
 *    IST bereits ein Erstbeitrag. Ein Kästchen, das nichts verändert, ist eine
 *    Behauptung über eine Funktion, die es nicht gibt.
 *
 * 2. „matching in title only" — WIRKUNGSLOS, aus demselben Grund: gesucht wird
 *    heute schon nur im TITEL (`Query.search('title')`, Fulltext-Index
 *    idx_title_search aus posts-008). Der `body` hat keinen Fulltext-Index; ihn
 *    anzulegen wäre eine eigene Migration über eine 10.000-Zeichen-Spalte und
 *    damit eine Stufe für sich. Erst DANN bekommt dieses Kästchen eine Aufgabe.
 *
 * 3. „include images" — GEGENSTANDSLOS. Das Markdown-Subset (core/shared/
 *    markdown.ts) kennt überhaupt keinen Bild-Knoten: fett, kursiv, Code,
 *    Links, Absätze, Listen, Zitate, Codeblöcke — mehr nicht, und es gibt
 *    keinen v-html-Pfad. Ein `![alt](url)` rendert als LINK. Der Filter könnte
 *    also bestenfalls Links mit Bild-Endung raten, und das ist eine andere,
 *    schwächere Aussage als „enthält ein Bild".
 *
 * 4. „are wiki" / „are archived" — GIBT ES NICHT. Weder Wiki-Beiträge noch ein
 *    Archiv sind gebaut. Nicht erfinden (Konzept § 3.3 sagt das ausdrücklich).
 *
 * 5. „public" — KEINE EIGENSCHAFT EINES THEMAS. Sichtbarkeit hängt bei uns an
 *    der COMMUNITY (C18, `communities.audience`), nicht am einzelnen Beitrag:
 *    in einer öffentlichen Community sind alle Themen öffentlich, in einer
 *    geschlossenen keines. Der Filter hätte in jeder Community genau ein
 *    Ergebnis — alle oder keine.
 *
 * 6. „have zero replies" · „posts (min/max)" · „views (min/max)" —
 *    NICHT EHRLICH FILTERBAR. Beide Zahlen stehen NICHT auf der Themen-Zeile:
 *    Antworten liegen im comments-Layer und werden je Ziel LIVE gezählt (eine
 *    `count`-Abfrage pro Thema, gedeckelt bei 50 Zielen), Aufrufe liegen in der
 *    eigenen Tabelle `post_views` (posts-010). Appwrite kann nicht verbinden
 *    und nicht gruppieren. Es blieben zwei Wege, beide falsch:
 *      (a) die geholte SEITE nachträglich filtern — dann stimmt die Seitenzahl
 *          nicht mehr und „25 Treffer" wären in Wahrheit 4. Genau die Sorte
 *          Etikett ohne Deckung, die „Hot" in Stufe 1 verhindert hat.
 *      (b) je Kandidat eine Zählabfrage — bei 25 Zeilen 25 Rundreisen, und für
 *          eine ehrliche Seitenzahl über den GANZEN Bestand, nicht nur die
 *          Seite.
 *    Ehrlich baubar wird das erst mit einer denormalisierten Zähler-Spalte am
 *    Thema — mitsamt der Frage, wer sie beim Löschen, Ausblenden und der
 *    Kaskade nachzieht. Das ist eine eigene Stufe, keine Zugabe.
 *
 * GEBAUT ist damit alles, was auf der Themen-Zeile selbst steht: Kategorie,
 * Zeitraum (vorher/nachher), Autor, angeheftet, offen/geschlossen,
 * gelöst/ungelöst, Titel-Suche.
 */

/** Offen oder geschlossen? */
export const TOPIC_STATE_FILTERS = ['any', 'open', 'closed'] as const
export type TopicStateFilter = (typeof TOPIC_STATE_FILTERS)[number]

/** Gelöst oder nicht? */
export const TOPIC_SOLUTION_FILTERS = ['any', 'solved', 'unsolved'] as const
export type TopicSolutionFilter = (typeof TOPIC_SOLUTION_FILTERS)[number]

/**
 * ZWEI ACHSEN, ZWEI FELDER — und das ist eine Abweichung von Davids Vorlage.
 *
 * Discourse hat EINE Liste („any · open · closed · … · are solved · are
 * unsolved"), also kann man dort immer nur EINES davon wählen. Genau die
 * nützlichste Frage eines Forums lässt sich damit nicht stellen: „was ist
 * offen UND noch ungelöst?" — also das, was auf Antwort wartet. Zwei Felder
 * kosten einen Auswahlkasten mehr und können alle Kombinationen.
 */
export interface TopicFilters {
  /** Kategorie-SLUG ('' = alle). */
  category: string
  /** Nur Themen, die NACH diesem Zeitpunkt veröffentlicht wurden. */
  createdAfter: string | null
  /** Nur Themen, die VOR diesem Zeitpunkt veröffentlicht wurden. */
  createdBefore: string | null
  /** Row-Id des Autors ('' = alle). */
  author: string
  /** Nur Angeheftetes. (Es gibt bewusst kein „nur NICHT angeheftetes" —
   *  danach hat noch nie jemand gesucht.) */
  pinnedOnly: boolean
  state: TopicStateFilter
  solution: TopicSolutionFilter
  /** Titel-Suche, auf 100 Zeichen geklemmt. */
  search: string
}

export const EMPTY_TOPIC_FILTERS: TopicFilters = {
  category: '',
  createdAfter: null,
  createdBefore: null,
  author: '',
  pinnedOnly: false,
  state: 'any',
  solution: 'any',
  search: '',
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Row-Ids sind 36 Zeichen — alles andere ist kein Autor, sondern Müll. */
function rowId(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return /^[A-Za-z0-9_-]{1,36}$/.test(trimmed) ? trimmed : ''
}

/**
 * Die Filter aus einem Query-Objekt lesen (Server: `getQuery(event)`,
 * Client: `route.query`).
 *
 * `now` ist injizierbar, weil `created-after` auch relative Angaben (`7d`)
 * versteht — ohne das wäre der Test von der Uhr abhängig.
 */
export function parseTopicFilters(
  query: Record<string, unknown>,
  now: Date = new Date(),
): TopicFilters {
  const after = createdAfterIso(query['created-after'], now)
  const before = dayStartIso(query['created-before'])

  return {
    category: typeof query.category === 'string' ? query.category.trim().slice(0, 64) : '',
    /**
     * EIN UMGEDREHTES FENSTER WIRD VERWORFEN, nicht stillschweigend geliefert.
     * „nach dem 1. März und vor dem 1. Februar" kann nichts treffen — die
     * leere Liste sähe dann aus, als gäbe es keine Themen, statt zu zeigen,
     * dass die Eingabe unmöglich ist. Beide Grenzen fallen weg, die Liste
     * bleibt vollständig, und der Mensch sieht seinen Fehler an den leeren
     * Feldern.
     */
    ...(after && before && after >= before
      ? { createdAfter: null, createdBefore: null }
      : { createdAfter: after, createdBefore: before }),
    author: rowId(query.author),
    // Nur die ausdrückliche '1' — sonst würde ein `?pinned=0` aus einem
    // geteilten Link als „ja" gelesen (jeder nicht-leere String ist truthy).
    pinnedOnly: query.pinned === '1' || query.pinned === true,
    state: pick(query.state, TOPIC_STATE_FILTERS, 'any'),
    solution: pick(query.solution, TOPIC_SOLUTION_FILTERS, 'any'),
    search: typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '',
  }
}

/**
 * Wie viele Filter sind gesetzt? (Die Oberfläche zeigt die Zahl am
 * zugeklappten Knopf — sonst sucht man sich tot, warum die Liste leer ist.)
 *
 * Kategorie und Titel-Suche zählen NICHT mit: die haben ihre eigenen,
 * sichtbaren Bedienelemente außerhalb des Aufklapp-Bereichs. Gezählt wird nur,
 * was man beim Zuklappen aus den Augen verliert.
 */
export function activeTopicFilterCount(filters: TopicFilters): number {
  return [
    filters.createdAfter !== null,
    filters.createdBefore !== null,
    filters.author !== '',
    filters.pinnedOnly,
    filters.state !== 'any',
    filters.solution !== 'any',
  ].filter(Boolean).length
}

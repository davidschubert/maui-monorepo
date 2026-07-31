import type { Models } from 'node-appwrite'

/**
 * Zentrales Kunden-Feedback (E10, docs/plans/CUSTOMER-FEEDBACK.md) — der
 * VERTRAG. Pure Regeln + Typen, ohne h3 und ohne Appwrite-Aufrufe, weil sie an
 * DREI Stellen dieselbe Wahrheit sein müssen:
 *
 *  - im Control Plane (es besitzt die Tabellen und setzt durch),
 *  - im feedback-Layer jeder Runtime-App (Widget, Liste, Roadmap),
 *  - im Test (die Regeln sind der Teil, den man nicht „mal eben nachsieht").
 *
 * WO DAS LIEGT UND WARUM: die Zeilen leben im control-Projekt. Ein Browser auf
 * `a.pukalani.app` hat dort weder Session noch Leserecht (dieselbe Wand wie D6
 * und C17) — deshalb fragt laut Davids Entscheidung 1 „jedes Dashboard seinen
 * EIGENEN Server", der über die Service-Naht bei control nachfragt. Es gibt
 * EINE Wahrheit, keine Spiegelzeile. Der feedback-Layer importiert diese Datei
 * per relativem Pfad type-/wertweise, genau wie onboarding schon
 * `control/shared/onboarding.ts` konsumiert — er hängt NICHT vom control-Layer
 * ab (in apps/platform ist der gar nicht eingebaut).
 */

export const CUSTOMER_FEEDBACK_TABLE = 'customer_feedback'
export const CUSTOMER_FEEDBACK_VOTES_TABLE = 'customer_feedback_votes'
export const CUSTOMER_FEEDBACK_COMMENTS_TABLE = 'customer_feedback_comments'
export const CUSTOMER_FEEDBACK_MUTES_TABLE = 'customer_feedback_mutes'

/**
 * Bereich — Davids Entscheidung 5: ZWEI Felder statt einer Liste. Die Achse ist
 * „woran arbeitet das?"; welches Produkt genau, steht im zweiten Feld und kommt
 * aus dem BESTEHENDEN Produkt-Katalog (product.manifest.ts der Layer). Damit
 * veraltet keine zweite Liste getrennt: ein neuer Layer steht automatisch zur
 * Wahl.
 */
export const FEEDBACK_AREAS = ['core', 'product', 'billing', 'other'] as const
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number]

/**
 * Board-Zustände. Verschieben ist Betreiber-Sache (Plan § „Board-Zustände") —
 * die Reihenfolge HIER ist zugleich die Spaltenreihenfolge der Roadmap.
 */
export const FEEDBACK_STATES = ['under_review', 'planned', 'in_progress', 'complete'] as const
export type FeedbackState = (typeof FEEDBACK_STATES)[number]

/** Sortierung der öffentlichen Liste. */
export const FEEDBACK_SORTS = ['trending', 'top', 'new'] as const
export type FeedbackSort = (typeof FEEDBACK_SORTS)[number]

/**
 * Moderations-Zustand (Davids Entscheidung 8): VERSTECKEN statt löschen, wie
 * bei Kommentaren. Eine versteckte Zeile bleibt für den Betreiber sichtbar und
 * behält ihre Stimmen — sonst wäre „verstecken" ein verkapptes Löschen.
 */
export const FEEDBACK_VISIBILITIES = ['visible', 'hidden'] as const
export type FeedbackVisibility = (typeof FEEDBACK_VISIBILITIES)[number]

export const MAX_FEEDBACK_TITLE = 120
export const MAX_FEEDBACK_MESSAGE = 2000
export const MAX_FEEDBACK_COMMENT = 1000
export const MAX_FEEDBACK_PAGE = 300

/** Seitengröße der Liste — dieselbe Zahl auf beiden Seiten der Naht. */
export const FEEDBACK_PAGE_SIZE = 25

/**
 * Die Pfade der Service-Naht. Sie stehen im VERTRAG und nicht je Seite als
 * Zeichenkette, weil sonst genau ein Tippfehler genügt, um einen Aufruf
 * stillschweigend ins Leere laufen zu lassen (404 → 503 → „control ist
 * gestört", obwohl nur ein Buchstabe fehlt).
 *
 * `update` und `mute` sind Betreiber-Sache und laufen praktisch immer
 * in-process (apps/control IST das Control Plane). Sie haben trotzdem eine
 * HTTP-Route, weil beide Gegenseiten DENSELBEN Einstiegspunkt bedienen sollen
 * — über die Naht endet sie folgerichtig in 403 `operator_only`, denn dort ist
 * `isOperator` fest false. Die Regel steht damit an der Tür, nicht in der
 * Abwesenheit einer Tür.
 */
export const FEEDBACK_SERVICE_PATHS = {
  list: '/api/control/feedback/list',
  submit: '/api/control/feedback/submit',
  vote: '/api/control/feedback/vote',
  comments: '/api/control/feedback/comments',
  comment: '/api/control/feedback/comment',
  update: '/api/control/feedback/update',
  mute: '/api/control/feedback/mute',
  userData: '/api/control/feedback/user-data',
  userErase: '/api/control/feedback/user-erase',
} as const

export type FeedbackServicePath = (typeof FEEDBACK_SERVICE_PATHS)[keyof typeof FEEDBACK_SERVICE_PATHS]

/**
 * Fenster für „Trending". Appwrite kann nach einer gerechneten Größe nicht
 * sortieren, also holt der Server ein begrenztes Fenster der jüngsten Zeilen
 * und rechnet im Speicher. Bewusste Grenze: Trending IST eine Aussage über die
 * jüngste Zeit — ein Eintrag von vor einem Jahr soll dort nicht auftauchen,
 * egal wie viele Stimmen er hat (dafür gibt es „Top").
 */
export const FEEDBACK_TRENDING_WINDOW = 200

// ── Zeilen (Control-Plane-Projekt) ─────────────────────────────────────────

export interface CustomerFeedbackRow extends Models.Row {
  area: FeedbackArea
  /** Produkt-Key aus dem Katalog — '' außer bei area 'product'. */
  productKey: string
  title: string
  message: string
  state: FeedbackState
  status: FeedbackVisibility
  /** Pfad, von dem gesendet wurde (Kontext für die Sichtung). */
  page: string
  /** HERKUNFT — nur der Betreiber sieht sie (Entscheidung 2). '' = anonym. */
  communityId: string
  communityName: string
  runtimeProjectId: string
  authorUserId: string
  authorName: string
  authorEmail: string
  /** Denormalisierte Zähler — die Liste sortiert danach. */
  voteCount: number
  /** „aus N Communities" (Entscheidung 3): Breite neben Lautstärke. */
  communityCount: number
  commentCount: number
  /** Letzte Stimme — nur Diagnose; Trending rechnet über $createdAt. */
  lastVoteAt: string | null
}

export interface CustomerFeedbackVoteRow extends Models.Row {
  feedbackId: string
  /** `<runtimeProjectId>:<userId>` — EINE Stimme pro Person (Entscheidung 3). */
  voterKey: string
  communityId: string
}

export interface CustomerFeedbackCommentRow extends Models.Row {
  feedbackId: string
  body: string
  status: FeedbackVisibility
  authorUserId: string
  authorName: string
  communityId: string
  runtimeProjectId: string
}

export interface CustomerFeedbackMuteRow extends Models.Row {
  /** = $id der Zeile (Row-Id IST die communityId — Stummschalten ist idempotent). */
  communityId: string
  communityName: string
  mutedBy: string
}

// ── Sicht nach außen ───────────────────────────────────────────────────────

/**
 * HERKUNFT (Davids Entscheidung 2): wer geschrieben hat und aus welcher
 * Community, bleibt dem Betreiber vorbehalten. „Firma X wünscht sich Funktion
 * Y" ist eine Geschäftsinformation — Kunde A darf nicht sehen, woran Kunde B
 * arbeitet. Der Text selbst ist für alle sichtbar, sonst wäre das Wählen sinnlos.
 */
export interface FeedbackOrigin {
  communityId: string
  communityName: string
  runtimeProjectId: string
  authorUserId: string
  authorName: string
  authorEmail: string
}

export interface FeedbackEntry {
  id: string
  area: FeedbackArea
  productKey: string
  title: string
  message: string
  state: FeedbackState
  status: FeedbackVisibility
  page: string
  voteCount: number
  communityCount: number
  commentCount: number
  createdAt: string
  /** Hat DER BETRACHTER schon gewählt? */
  hasVoted: boolean
  /** Ist das sein eigenes Feedback? (Er sieht es selbstverständlich mit Status.) */
  mine: boolean
  /** null für alle außer dem Betreiber. */
  origin: FeedbackOrigin | null
}

export interface FeedbackComment {
  id: string
  body: string
  authorName: string
  createdAt: string
  mine: boolean
  status: FeedbackVisibility
}

export interface FeedbackListResult {
  total: number
  entries: FeedbackEntry[]
  /** Sieht der Betrachter die Betreiber-Sicht? (UI-Spalten, Aktionen) */
  operator: boolean
}

// ── Der Handelnde ──────────────────────────────────────────────────────────

/**
 * Wer schreibt/liest gerade? Das Control Plane baut ihn IMMER selbst — aus dem
 * geprüften Appwrite-JWT (Service-Naht) oder aus der eigenen Session (wenn die
 * Betreiber-App selbst fragt). Nie aus einem durchgereichten Body-Feld: das ist
 * dieselbe Regel wie `tenantId` kommt nie vom Aufrufer.
 */
export interface FeedbackActor {
  /** Runtime-Projekt des Nutzers; '' = anonym. */
  projectId: string
  /** '' = anonym (Entscheidung 4: ohne Login heißt wirklich anonym). */
  userId: string
  name: string
  email: string
  /** Community, aus der er kommt; '' = keine (Kontroll-Host, Betreiber). */
  communityId: string
  communityName: string
  /** Betreiber-Sicht: Herkunft lesbar, Zustand änderbar, Verstecken erlaubt. */
  isOperator: boolean
}

export const ANONYMOUS_ACTOR: FeedbackActor = {
  projectId: '', userId: '', name: '', email: '',
  communityId: '', communityName: '', isOperator: false,
}

// ── Pure Regeln ────────────────────────────────────────────────────────────

/**
 * EINE Stimme pro Person (Entscheidung 3). Der Schlüssel trägt das PROJEKT mit,
 * weil dieselbe User-Id in zwei Appwrite-Projekten zwei verschiedene Menschen
 * sind — ohne das Präfix könnte eine Silo-Instanz die Stimme eines Pool-Nutzers
 * überschreiben.
 */
export function voterKeyFor(projectId: string, userId: string): string {
  return `${projectId}:${userId}`
}

/** Anonym ⇒ keine Stimme, kein Kommentar, keine Nachverfolgung. */
export function actorCanParticipate(actor: FeedbackActor): boolean {
  return actor.userId !== '' && actor.projectId !== ''
}

/**
 * Titel aus der Nachricht ableiten — die erste Zeile, gekappt. Der Betreiber
 * kann ihn später überschreiben; ein leeres Feld wäre in einer Liste mit
 * Stimmen unbrauchbar, und ein Pflichtfeld im Widget würde die Hürde erhöhen,
 * die bewusst minimal bleiben soll.
 */
export function deriveFeedbackTitle(message: string): string {
  const first = message.trim().split('\n')[0]?.trim() ?? ''
  if (first === '') return 'Feedback'
  return first.length > MAX_FEEDBACK_TITLE ? `${first.slice(0, MAX_FEEDBACK_TITLE - 1)}…` : first
}

/**
 * Trending-Gewicht: Zustimmung geteilt durch Alter. Kommentare zählen doppelt —
 * wer schreibt, investiert mehr als wer klickt. Die Form ist die bekannte
 * HN-Kurve (Potenz über der Stunde), bewusst ohne Feinjustage: sie muss nicht
 * exakt sein, sondern nachvollziehbar und monoton.
 */
export function trendingScore(
  entry: { voteCount: number, commentCount: number, createdAt: string },
  now: number = Date.now(),
): number {
  const ageMs = Math.max(0, now - Date.parse(entry.createdAt))
  const ageHours = ageMs / 3_600_000
  return (entry.voteCount + 2 * entry.commentCount + 1) / Math.pow(ageHours + 2, 1.5)
}

/**
 * Sortierung im Speicher. `new` und `top` könnte Appwrite auch, sie stehen hier
 * trotzdem mit: dann sortieren Server UND Vorschau nach derselben Funktion, und
 * der Test deckt alle drei Fälle mit einer Aussage ab.
 */
export function sortFeedbackEntries<T extends { voteCount: number, commentCount: number, createdAt: string }>(
  entries: readonly T[],
  sort: FeedbackSort,
  now: number = Date.now(),
): T[] {
  const list = [...entries]
  if (sort === 'new') {
    return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }
  if (sort === 'top') {
    // Gleichstand nach Stimmen → jüngeres zuerst (sonst ist die Reihenfolge
    // zwischen zwei Ladevorgängen zufällig und die Liste „zappelt").
    return list.sort((a, b) => b.voteCount - a.voteCount || Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }
  return list.sort((a, b) => trendingScore(b, now) - trendingScore(a, now))
}

/**
 * Die Projektion — die EINE Stelle, an der entschieden wird, was ein Betrachter
 * von einer Zeile zu sehen bekommt. Sie ist pur und getestet, weil sie die
 * Datenschutz-Zusage aus Entscheidung 2 trägt: fiele `origin` versehentlich in
 * die Antwort, sähe man es der Oberfläche nicht an.
 */
export function projectFeedbackEntry(
  row: CustomerFeedbackRow,
  viewer: { actor: FeedbackActor, hasVoted: boolean },
): FeedbackEntry {
  const mine = actorCanParticipate(viewer.actor)
    && row.authorUserId === viewer.actor.userId
    && row.runtimeProjectId === viewer.actor.projectId
  return {
    id: row.$id,
    area: row.area,
    productKey: row.productKey,
    title: row.title,
    message: row.message,
    state: row.state,
    status: row.status,
    page: viewer.actor.isOperator ? row.page : '',
    voteCount: row.voteCount,
    communityCount: row.communityCount,
    commentCount: row.commentCount,
    createdAt: row.$createdAt,
    hasVoted: viewer.hasVoted,
    mine,
    origin: viewer.actor.isOperator
      ? {
          communityId: row.communityId,
          communityName: row.communityName,
          runtimeProjectId: row.runtimeProjectId,
          authorUserId: row.authorUserId,
          authorName: row.authorName,
          authorEmail: row.authorEmail,
        }
      : null,
  }
}

/**
 * Darf der Betrachter diese Zeile überhaupt sehen? Versteckte Zeilen sieht nur
 * der Betreiber — und der VERFASSER seine eigene, damit „verstecken" für ihn
 * nicht wie „spurlos verschwunden" aussieht.
 */
export function feedbackVisibleFor(row: CustomerFeedbackRow, actor: FeedbackActor): boolean {
  if (row.status === 'visible') return true
  if (actor.isOperator) return true
  return actorCanParticipate(actor)
    && row.authorUserId === actor.userId
    && row.runtimeProjectId === actor.projectId
}

export type FeedbackDenyReason =
  /** Ohne Login: kein Wählen, kein Kommentieren (Entscheidung 4). */
  | 'anonymous'
  /** Diese Community ist stummgeschaltet (Entscheidung 8). */
  | 'community_muted'
  /** Nur der Betreiber verschiebt Zustände / versteckt. */
  | 'operator_only'
  /** Unbekannter Zustand/Bereich. */
  | 'invalid_value'

export type FeedbackDecision = { ok: true } | { ok: false, reason: FeedbackDenyReason }

const ALLOW: FeedbackDecision = { ok: true }
const deny = (reason: FeedbackDenyReason): FeedbackDecision => ({ ok: false, reason })

/** Darf gesendet werden? Anonym ja (Entscheidung 4) — stummgeschaltet nein. */
export function decideSubmit(actor: FeedbackActor, muted: boolean): FeedbackDecision {
  // Die Stummschaltung trifft eine COMMUNITY. Ein anonymer Absender hat keine,
  // also greift sie bei ihm nicht — sein Schutz ist das Rate-Limit.
  if (muted && actor.communityId !== '') return deny('community_muted')
  return ALLOW
}

/** Darf gewählt/kommentiert werden? */
export function decideParticipate(actor: FeedbackActor): FeedbackDecision {
  if (!actorCanParticipate(actor)) return deny('anonymous')
  return ALLOW
}

/** Darf der Zustand/die Sichtbarkeit geändert werden? */
export function decideModerate(actor: FeedbackActor): FeedbackDecision {
  if (!actor.isOperator) return deny('operator_only')
  return ALLOW
}

export function isFeedbackState(value: unknown): value is FeedbackState {
  return typeof value === 'string' && (FEEDBACK_STATES as readonly string[]).includes(value)
}

export function isFeedbackArea(value: unknown): value is FeedbackArea {
  return typeof value === 'string' && (FEEDBACK_AREAS as readonly string[]).includes(value)
}

export function isFeedbackSort(value: unknown): value is FeedbackSort {
  return typeof value === 'string' && (FEEDBACK_SORTS as readonly string[]).includes(value)
}

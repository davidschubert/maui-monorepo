import type { Models } from 'node-appwrite'

export const POSTS_TABLE = 'community_posts'
export const POLL_VOTES_TABLE = 'poll_votes'
export const POST_VOTES_TABLE = 'post_votes'
/** F1 Stufe 1: die vom Admin gepflegte Kategorien-Struktur der Discussions. */
export const POST_CATEGORIES_TABLE = 'post_categories'

export const POST_TYPES = ['post', 'poll', 'question'] as const
export type PostType = (typeof POST_TYPES)[number]

/** scheduled = geplant (nur Autor sichtbar) · hidden = Moderation · deleted = Autor-Soft-Delete */
export type PostStatus = 'scheduled' | 'published' | 'hidden' | 'deleted'

export const MAX_POLL_OPTIONS = 6
export const MAX_POLL_OPTION_LENGTH = 100
export const MAX_POST_BODY = 10_000
export const MAX_POST_TITLE = 200

export const MAX_CATEGORY_NAME = 80
export const MAX_CATEGORY_SLUG = 64
export const MAX_CATEGORY_DESCRIPTION = 500

export interface CommunityPost extends Models.Row {
  type: PostType
  /** optional — Fragen/Polls tragen die Frage oft nur im body */
  title: string | null
  /** Markdown-Subset (core shared/markdown.ts), niemals Raw-HTML */
  body: string
  authorId: string
  authorName: string
  status: PostStatus
  scheduledAt: string | null
  publishedAt: string | null
  /** JSON-Array der Optionstexte (max 6) — nur bei type 'poll' */
  pollOptions: string | null
  pollEndsAt: string | null
  /** denormalisiert, schreibt NUR der Server (Recount, Migration 003) */
  upvotes: number
  downvotes: number
  score: number
  /**
   * F1 Stufe 1: Row-Id der Kategorie ODER '' (keine).
   *
   * BEWUSST NICHT optional getippt, obwohl die Spalte additiv und leer-fähig
   * ist: `tenantDb().create<CommunityPost>` verlangt alle Nicht-`Models.Row`-
   * Felder VOLLSTÄNDIG (RowDataCreate). Ein `?` hier hätte bedeutet, dass jede
   * künftige Anlegestelle die Kategorie stillschweigend weglassen kann —
   * derselbe Grund, aus dem `createRow<TenantRow>` im Control Plane alle
   * Spalten erzwingt.
   *
   * '' statt null: die Spalte ist ein Varchar mit Default '' (Bestandszeilen
   * tragen genau das), und ein zweiter „leer"-Wert daneben wäre eine
   * Fallunterscheidung, die niemand gewinnt.
   */
  categoryId: string
  /**
   * F1 Stufe 2: WANN war an diesem Beitrag zuletzt etwas los — Veröffentlichung
   * oder eine ANTWORT darunter (Core-Vertrag `notifyContentActivity`, Migration
   * posts-009).
   *
   * WARUM ES DIESE SPALTE GIBT statt weiter `$updatedAt` zu lesen: `$updatedAt`
   * bewegt sich bei jeder STIMME (score.post.ts schreibt upvotes/downvotes/score
   * auf die Zeile) und bei keiner ANTWORT (die liegt im comments-Layer). Die
   * Spalte „Aktivität" zeigte damit genau das Falsche.
   *
   * `null` heißt „noch nie" — geplante Beiträge (`status: 'scheduled'`) tragen
   * es bis zur Veröffentlichung, Bestand von vor der Migration ebenfalls, bis
   * der Backfill ihn erreicht. Lesen deshalb NIE roh, sondern über
   * `topicActivityAt()` (shared/discussionActivity.ts).
   *
   * SCHREIBEN darf das ausschließlich der Server: der Handler in
   * server/plugins/content-activity.ts (Operator-Klinke) und die
   * Veröffentlichungs-Pfade. Es gibt keine Route, die den Wert aus einem Body
   * übernimmt — sonst könnte sich ein Beitrag nach oben schreiben.
   */
  lastActivityAt: string | null
}

/**
 * Eine Discussions-Kategorie. Struktur ist ADMIN-Sache (Davids Vorgabe,
 * Konzept Teil 1) — Mitglieder eröffnen Topics darin, legen aber keine
 * Kategorien an.
 */
export interface PostCategory extends Models.Row {
  name: string
  /** URL-Segment. NACH DER ANLAGE FEST — die Kategorie-SEITE
   *  (/discussions/<slug>) ist der eine Link, der sich nicht über eine Id
   *  selbst heilen kann (pages-Muster „Später nicht änderbar"). */
  slug: string
  description: string
  sortOrder: number
  /** false = aus der öffentlichen Auswahl genommen, Bestand bleibt lesbar. */
  active: boolean
}

export type PostVoteValue = 1 | -1

export interface PostVote extends Models.Row {
  postId: string
  userId: string
  value: PostVoteValue
}

export interface PostVoteResponse {
  post: CommunityPost
  myVote: PostVoteValue | null
}

export interface PollVote extends Models.Row {
  postId: string
  userId: string
  optionIndex: number
}

/** Poll-Zustand, wie ihn der GET je Post anreichert */
export interface PollState {
  options: string[]
  /** Stimmen je Option — nur gefüllt, wenn results true */
  counts: number[]
  totalVotes: number
  /** eigene Stimme (Options-Index) oder null */
  myVote: number | null
  /** Ergebnisse sichtbar? (eigene Stimme abgegeben ODER Poll beendet) */
  results: boolean
  /** Poll beendet (pollEndsAt erreicht)? */
  ended: boolean
}

export interface FeedPost extends CommunityPost {
  authorAvatarUrl?: string
  poll?: PollState
  /** eigener Up-/Downvote auf den Post (nicht die Poll-Stimme) */
  myPostVote?: PostVoteValue | null
}

export interface PostListResponse {
  rows: FeedPost[]
  nextCursor: string | null
}

/**
 * Advisory-Antwort des KI-Moderations-Assists (POST /api/posts/:id/assist).
 * Bewusst lokal definiert (gleiche Shape wie admin ModerationAssist) statt
 * Cross-Package-Import — Layer bleiben entkoppelt, wie bei ModeratedComment.
 */
export interface PostModerationAssist {
  /** 'hide' = Ausblenden empfohlen · 'dismiss' = Beitrag ok, Meldungen verwerfen */
  action: 'hide' | 'dismiss'
  /** Schwere des Verstoßes 1 (harmlos) – 5 (gravierend) */
  severity: number
  /** 2-3 Sätze Begründung (Deutsch) */
  assessment: string
  /** Verwendetes Model (Transparenz im UI/Debugging) */
  model: string
}

export interface PostModerationResponse {
  rows: CommunityPost[]
  reportCounts: Record<string, number>
  /** true = KI-Assist nutzbar (pukalani.ai an + NUXT_AI_KEY gesetzt) → UI zeigt den Button */
  aiAssist: boolean
}

/**
 * „Meine Beiträge" (GET /api/posts/mine) — die Fläche der Capability
 * `posts.write` (C16). Bewusst dieselbe Shape wie die Moderations-Antwort,
 * nur ohne Meldungen und KI: ein Editor verwaltet seine eigenen Beiträge,
 * er moderiert nicht.
 */
export interface PostMineResponse {
  rows: CommunityPost[]
}

/**
 * EINE Zeile der Topics-Tabelle (F1 Stufe 1).
 *
 * BEWUSST NICHT `FeedPost`: die Übersicht zeigt Titel, Kategorie, Autor,
 * Stimmen und Zeit — der `body` (bis 10.000 Zeichen) hat dort nichts verloren,
 * und Umfrage-Zustände kosten pro Zeile mehrere Count-Abfragen. Die Detailseite
 * holt sich den vollen Beitrag.
 */
export interface DiscussionTopic {
  $id: string
  title: string
  /** Abgeleiteter Slug — der Client baut damit den kanonischen Link, ohne die
   *  Ableitungsregel ein zweites Mal zu kennen. */
  slug: string
  /** Kanonischer Pfad OHNE Locale-Prefix (localePath() setzt ihn). */
  path: string
  authorId: string
  authorName: string
  authorAvatarUrl?: string
  categoryId: string
  categoryName: string
  categorySlug: string
  score: number
  publishedAt: string | null
  /**
   * Spalte „Aktivität". QUELLE seit Stufe 2: `community_posts.lastActivityAt`
   * mit der Rückfall-Kette aus `topicActivityAt()` — also Veröffentlichung ODER
   * letzte Antwort, und ausdrücklich NICHT `$updatedAt` (das bewegte jede
   * Stimme mit und keine Antwort).
   */
  lastActivityAt: string
}

export interface DiscussionListResponse {
  rows: DiscussionTopic[]
  nextCursor: string | null
}

/** Detailansicht: der volle Beitrag plus seine Kategorie (für Kopfzeile/Canonical). */
export interface DiscussionTopicResponse {
  post: FeedPost
  category: PostCategory
  /** Kanonischer Pfad — der Server rechnet ihn, der Client vergleicht nur. */
  path: string
  slug: string
}

/** Kategorie samt Anzahl ihrer Topics (Kategorien-Ansicht + Dashboard). */
export interface CategoryWithCount {
  category: PostCategory
  topicCount: number
}

export interface CategoryListResponse {
  rows: CategoryWithCount[]
}

/**
 * Seitenleiste (Davids Entscheidung 7): meine letzten Kategorien, sonst die
 * größten. `source` sagt der Oberfläche, welche Überschrift stimmt — ein
 * „Deine Kategorien" über den fünf größten wäre eine Lüge.
 */
export interface DiscussionSidebarResponse {
  rows: PostCategory[]
  source: 'mine' | 'largest'
}

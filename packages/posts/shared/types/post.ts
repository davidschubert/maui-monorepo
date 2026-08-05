import type { Models } from 'node-appwrite'
import type { BadgeFacts, BadgeGroup } from '../badges'

export const POSTS_TABLE = 'community_posts'
export const POLL_VOTES_TABLE = 'poll_votes'
export const POST_VOTES_TABLE = 'post_votes'
/** F1 Stufe 1: die vom Admin gepflegte Kategorien-Struktur der Discussions. */
export const POST_CATEGORIES_TABLE = 'post_categories'
/**
 * F1 Stufe 2: die Aufruf-Zähler der Topics — EINE eigene Tabelle, EINE Zeile je
 * Beitrag (`rowId = postId`).
 *
 * WARUM NICHT EINE SPALTE AUF DER BEITRAGS-ZEILE (die naheliegende Lösung, und
 * die falsche): jeder Aufruf durch einen beliebigen Gast würde dann
 *  - `$updatedAt` des Beitrags bewegen — und damit genau die Aktivitäts-Rechnung
 *    zerstören, die Stufe 2 eine Datei weiter oben gerade in Ordnung gebracht
 *    hat (`lastActivityAt` gäbe es dann umsonst),
 *  - ein Realtime-Ereignis auf der Beitrags-Zeile veröffentlichen. Jeder
 *    Feed-Abonnent bekäme Ereignisse durch bloßes ANSCHAUEN — Aufregung ohne
 *    Neuigkeit, auf Kosten jedes offenen Fensters.
 * Eine eigene Zeile ist beides nicht: sie hat keine Leser im Client (keine
 * Row-Permissions, siehe Migration posts-010) und damit auch keine
 * Realtime-Relevanz.
 */
export const POST_VIEWS_TABLE = 'post_views'
/** F1 Stufe 4: verliehene Abzeichen, EINE Zeile je (Community, Nutzer, Abzeichen). */
export const USER_BADGES_TABLE = 'user_badges'

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
  /**
   * F1 Stufe 3: die drei Zustände eines Themas (Migration posts-011).
   *
   * ORTHOGONAL zu `status`, nicht Teil davon — ein geschlossenes Thema ist
   * weiterhin veröffentlicht, ein angeheftetes kann zugleich gelöst sein. Die
   * ausführliche Begründung (inklusive der live geprüften Tatsache, dass
   * `status` nur ein varchar ist und die Alternative technisch möglich WÄRE)
   * steht im Kopf der Migration.
   *
   * PFLICHT im Typ, obwohl die Spalten additiv mit Default `false` angelegt
   * sind — dieselbe Entscheidung wie bei `categoryId` (posts-008): so muss
   * JEDE künftige Anlegestelle sie hinschreiben, statt sie stillschweigend
   * wegzulassen. Folge: die Migration MUSS vor dem Deploy laufen.
   *
   * `pinned` = steht in der Liste oben · `closed` = nimmt keine neuen
   * Kommentare mehr an (durchgesetzt über den Core-Vertrag
   * `assertContentWritable`) · `solved` = die Frage ist beantwortet.
   */
  pinned: boolean
  closed: boolean
  solved: boolean
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

/**
 * Aufruf-Zähler EINES Topics (F1 Stufe 2). `$id` IST die Beitrags-Id — das
 * macht den Zähler ohne Nachschlagen adressierbar und den gepufferten
 * Schreibvorgang idempotent (anlegen ODER hochzählen, nie beides).
 */
export interface PostViewCounter extends Models.Row {
  postId: string
  count: number
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
  /**
   * Spalte „Aufrufe" (F1 Stufe 2) — Aggregat aus `post_views`, NICHT von der
   * Beitrags-Zeile (Begründung bei POST_VIEWS_TABLE).
   *
   * `0` ist hier eine ECHTE Aussage („noch nie aufgerufen") und kein
   * Platzhalter: die Zahl kommt aus derselben Antwort wie die Zeile, ist also
   * immer geprüft. Deshalb zeigt die Tabelle sie als Null — anders als die
   * Antwort-Anzahl, die die Komposition nachlädt und bis dahin als „—" führt.
   *
   * BIS ZU EINER MINUTE ALT: die Zähler werden gepuffert geschrieben
   * (server/utils/topicViews.ts). Für ein Aggregat ist das die richtige
   * Abwägung — der Preis exakter Zahlen wäre ein Datenbank-Schreibvorgang je
   * Seitenaufruf eines Unangemeldeten, auf einem geteilten Pool.
   */
  views: number
  /**
   * F1 Stufe 3: die Zustände, als Abzeichen in der Themen-Spalte. Sie stehen
   * hier, weil die Liste sie ZEIGT und danach FILTERT — beides ginge sonst nur
   * über einen zweiten Abruf je Zeile.
   */
  pinned: boolean
  closed: boolean
  solved: boolean
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
 * Die Zahlen der About-Seite (F1 Stufe 2) — AUSSCHLIESSLICH das, was aus
 * `community_posts` belegbar ist.
 *
 * Drei Kennzahlen aus Davids Katalog fehlen hier bewusst (aktive Nutzer,
 * Likes gesamt, Gründungsdatum). Welche Quelle ihnen jeweils fehlt und was sie
 * kosten würden, steht vollständig im Kopf von
 * server/api/posts/discussions/about.get.ts — sie sind weggelassen, nicht
 * vergessen. Die vierte („Beitritte") ist seit F1/2026-08-04 da, aber OPTIONAL:
 * sie kommt aus dem Control Plane und fehlt, wo es keine Naht dorthin gibt.
 */
export interface DiscussionAboutResponse {
  /** Veröffentlichte Beiträge MIT Kategorie. */
  topicsTotal: number
  /** Davon in den letzten 7 Tagen (rollierendes Fenster). */
  topicsLast7Days: number
  /** Veröffentlichte Beiträge seit UTC-Mitternacht — der GANZE Strom, mit und
   *  ohne Kategorie (Davids Entscheidung 2: eine Community hat EINEN Ort). */
  postsToday: number
  /** Sichtbare Kategorien. */
  categories: number
  /**
   * Beitritte der letzten 7 Tage (`community_members` im Control Plane).
   *
   * OPTIONAL und NIEMALS 0 als Ersatz: fehlt das Feld, war die Zahl nicht zu
   * ermitteln (App ohne Control-Plane-Naht, Lesefehler — oder ein Gast in einer
   * geschlossenen Community). Die Oberfläche zeigt die Kachel dann gar nicht.
   */
  signupsLast7Days?: number
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

/**
 * EIN verliehenes Abzeichen (F1 Stufe 4, Migration posts-012).
 *
 * Kein `awardedAt`-Feld: `$createdAt` IST der Zeitpunkt der Verleihung, und
 * eine zweite Spalte daneben wäre eine zweite Wahrheit über dasselbe. Die
 * `communityId` steht bewusst nicht im Typ — sie gehört der Datentür.
 */
export interface UserBadge extends Models.Row {
  userId: string
  badgeKey: string
}

/** Ein Eintrag der Abzeichen-Galerie: Katalog-Zeile plus eigener Stand. */
export interface DiscussionBadge {
  key: string
  group: BadgeGroup
  earned: boolean
  /** Wann verliehen (ISO) — `null`, solange unverdient. */
  awardedAt: string | null
}

export interface DiscussionBadgesResponse {
  /** IMMER der volle Katalog, auch für Gäste: die Galerie zeigt, was es hier
   *  zu holen gibt, nicht nur das schon Erreichte. */
  rows: DiscussionBadge[]
  /**
   * Die gemessenen Zahlen — `null` für Gäste (es gibt niemanden zu messen).
   * Sie stehen in der Antwort, damit die Galerie den Fortschritt zeigen kann
   * („20 von 100"), ohne die Zählung ein zweites Mal anzustoßen.
   */
  facts: BadgeFacts | null
}

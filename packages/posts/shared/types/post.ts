import type { Models } from 'node-appwrite'
import type { BadgeFacts, BadgeGroup } from '../badges'
import type { TrustLevelProgress } from '../trustLevels'

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
/**
 * F1 (gemeinsames Paket): die MITSCHREIBENDEN Zähler, EINE Zeile je
 * (Community, Nutzer).
 *
 * WARUM SIE DEM posts-LAYER GEHÖRT, obwohl auch `comments` hineinmeldet: sie
 * ist Discussions-Infrastruktur, und Discussions ist dieser Layer. Core besitzt
 * keine Tabellen (A14), `comments` darf `posts` nicht kennen — also gibt es
 * dazwischen einen Core-Vertrag (`registerUserCounterRecorder`), und die
 * Tabelle liegt bei dem Layer, der sie auch auswertet (Abzeichen, später Trust
 * Levels).
 */
export const MEMBER_COUNTERS_TABLE = 'member_counters'

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
  /**
   * F1: WANN wurde der INHALT dieses Beitrags zuletzt bearbeitet (Migration
   * posts-014) — `null` heißt „nie", nicht „unbekannt".
   *
   * AUSDRÜCKLICH NICHT `$updatedAt`, und das ist derselbe Grund wie bei
   * `lastActivityAt`: `$updatedAt` bewegt sich bei jeder Stimme (score.post.ts
   * schreibt die Zähler auf die Zeile), bei jedem Anheften und bei jedem
   * Umkategorisieren. Ein „bearbeitet" daraus stünde an Themen, an deren Text
   * nie jemand war — genau die Sorte Hinweis, die man nach drei Tagen nicht
   * mehr glaubt. `comments.editedAt` (Migration comments-005) macht es seit
   * jeher so; hier wird die Schuld nachgeholt.
   *
   * GESETZT WIRD ES NUR VOM AUTOR-PFAD (`[id].patch.ts`) und nur, wenn Titel
   * oder Text sich WIRKLICH geändert haben — die Regel dafür ist pur und
   * getestet (`shared/postEdit.ts`). Zustands-Änderungen (anheften, schließen,
   * gelöst) laufen über `state.patch.ts` und rühren die Spalte nicht an.
   *
   * PFLICHT im Typ, obwohl die Spalte additiv und leer-fähig ist — dieselbe
   * Entscheidung wie bei `categoryId` und den drei Zuständen: so muss jede
   * künftige Anlegestelle sich entscheiden. Folge: die Migration MUSS vor dem
   * Deploy laufen.
   */
  editedAt: string | null
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
  /**
   * WOFÜR es verliehen wurde (F1 Teilpaket 2, Migration posts-015) — und damit
   * das, was eine zweite Verleihung von einer Wiederholung unterscheidet:
   * Row-Id des Inhalts (Posting-Gruppe) · Nummer des Mitgliedsjahres
   * (Jahrestag) · `''` bei einmaligen Abzeichen UND bei jeder Bestandszeile aus
   * der Zeit davor.
   *
   * Der Unique-Index (communityId, userId, badgeKey, qualifier) ist die ganze
   * Mechanik: verliehen wird blind, ein 409 heißt „dafür hat er es schon".
   */
  qualifier: string
}

/**
 * DIE MITSCHREIBENDEN ZÄHLER EINES MENSCHEN in EINER Community (F1, Migration
 * posts-013).
 *
 * Alle Zahlen sind ADDITIV geführt: sie werden beim Schreiben hoch- und beim
 * Zurücknehmen heruntergezählt, nie neu berechnet. Ausnahme ist der EINE
 * Startvorgang (`seeded`), der sie aus den Aggregaten setzt.
 *
 * `communityId` steht bewusst nicht im Typ — sie gehört der Datentür (Muster
 * `UserBadge`).
 */
export interface MemberCounters extends Models.Row {
  userId: string
  /** Eigenständige, veröffentlichte Beiträge. */
  topicsCreated: number
  /** Geschriebene Antworten (Kommentare). */
  repliesCreated: number
  /** Selbst vergebene Aufstimmen. */
  upvotesGiven: number
  /** Auf eigene Inhalte erhaltene Aufstimmen. */
  upvotesReceived: number
  /** Bearbeitungen EIGENER Inhalte. */
  edits: number
  /**
   * Wurden die Startwerte schon aus den Aggregaten gesetzt?
   *
   * DIE ZEILE ALLEIN REICHT ALS ANTWORT NICHT, und das ist der Grund für dieses
   * Feld: die Zeile entsteht beim ERSTEN Ereignis — das kann eine einzige
   * vergebene Stimme sein, auch bei jemandem, der vorher 500 vergeben hat. Ohne
   * die Unterscheidung „existiert" gegen „geeicht" stünde dort dann eine 1, und
   * ein längst verdientes Abzeichen wäre verloren.
   */
  seeded: boolean
  /**
   * Die ERARBEITETE Vertrauensstufe 0–3 (F1 Teilpaket 3, Migration posts-016).
   *
   * Wird ausschließlich nach OBEN geschrieben (`raisedTrustLevel`) — kein
   * Abstieg, Davids Entscheidung. Eine 4 steht hier nie: die kommt aus
   * `trustLevelLeader`. Bestandszeilen tragen NULL und werden beim Lesen zu 0
   * (`normalizeTrustLevel`); das ist die Wahrheit, nicht ein Loch — für sie
   * wurde die Stufe schlicht noch nie gerechnet.
   */
  trustLevel: number
  /**
   * Die von Hand ernannte Stufe 4 („Leader") — gesetzt und zurückgenommen vom
   * Owner (`posts.appoint`), nie von einer Rechnung.
   *
   * Getrennt von `trustLevel`, damit ein Entzug genau eine Entscheidung
   * zurücknimmt und nicht nebenbei die erarbeitete Stufe löscht (vollständige
   * Begründung im Kopf von Migration posts-016).
   */
  trustLevelLeader: boolean
}

/**
 * Ein Mensch in der Stufen-Verwaltung des Owners (F1 Teilpaket 3).
 *
 * Bewusst KEINE E-Mail: die Fläche beantwortet „wer bekommt Stufe 4", nicht
 * „wer ist hier angemeldet" — dieselbe Zurückhaltung wie bei der redigierten
 * Team-Sicht der About-Seite.
 */
export interface TrustLevelMember {
  userId: string
  /** Anzeigename aus dem Konto — leer, wenn er nicht aufzulösen war. */
  name: string
  /** Die WIRKENDE Stufe (erarbeitet oder ernannt). */
  level: number
  /** Die erarbeitete Stufe allein — sichtbar, damit ein Entzug erklärbar ist. */
  earnedLevel: number
  leader: boolean
  /** Eröffnete Themen plus geschriebene Antworten. */
  contentCreated: number
  upvotesGiven: number
  upvotesReceived: number
  /** Wann zuletzt an dieser Zeile etwas passiert ist (ISO). */
  updatedAt: string
}

export interface TrustLevelMembersResponse {
  /** Die aktuell Ernannten — vollständig, sie sind wenige. */
  leaders: TrustLevelMember[]
  /** Die zuletzt aktiven Mitglieder mit Zählern (gedeckelt, s. `truncated`). */
  members: TrustLevelMember[]
  /** Gab es mehr, als die Seite zeigt? Dann hilft nur die Suche. */
  truncated: boolean
}

/** Ein Eintrag der Abzeichen-Galerie: Katalog-Zeile plus eigener Stand. */
export interface DiscussionBadge {
  key: string
  group: BadgeGroup
  earned: boolean
  /**
   * Wann ZULETZT verliehen (ISO) — `null`, solange unverdient.
   *
   * Zuletzt und nicht zuerst: bei einem mehrfach verliehenen Abzeichen ist der
   * jüngste Verdienst die Neuigkeit, und die Galerie sagt „verliehen vor …".
   */
  awardedAt: string | null
  /** Wie oft verliehen (F1 Teilpaket 2) — 0, solange unverdient. */
  count: number
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
  /**
   * Die WIRKENDE Vertrauensstufe 0–4 (F1 Teilpaket 3) — 0 für Gäste.
   *
   * Sie steht NEBEN `facts.trustLevel` (dieselbe Zahl) und nicht nur darin,
   * weil `facts` für Gäste null ist und der Stufen-Abschnitt der Galerie auch
   * dort etwas zeigen können soll: die Stufen sind eine Auskunft darüber, was
   * es hier zu erreichen gibt.
   */
  trustLevel: number
  /**
   * Der Weg zur nächsten erarbeitbaren Stufe — `null`, wenn es keinen gibt
   * (Stufe 3 erreicht, Ernennung, oder Gast).
   */
  trustProgress: TrustLevelProgress | null
}

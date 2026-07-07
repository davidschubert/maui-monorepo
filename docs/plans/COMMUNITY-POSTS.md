# Plan: `packages/posts` — Community-Feed (Posts, Polls, Questions)

> Stand: 2026-07-07 · Status: **umgesetzt (GOALS Phase 25 ✅)** · Referenzen: [CONCEPT.md](../CONCEPT.md)
> (A14 Layer-Grenzen), `packages/comments` als Referenz-Feature-Layer,
> `packages/feed` (Activity-Stream), moderation-Layer (generische Reports),
> GOALS.md Phase 25. Vorbild-Idee: Circle.so „Feed / Polls & Questions" —
> hier bewusst auf die maui-Architektur umgeformt (Leitplanke, keine Kopie).

## 1. Ziel & Abgrenzung

Ein Feature-Layer `packages/posts`: der **Member-Content-Feed** — Mitglieder
erstellen Posts, Multiple-Choice-Polls und offene Fragen; die Community
antwortet über den bestehenden comments-Layer. Das ist das „Herz der
Community" (Circle: 84 % member-led activity).

**Abgrenzung zum Activity-Feed (`packages/feed`)**: der Activity-Feed ist die
*Chronik über Ereignisse* (system-geschrieben, read-only). Der Community-Feed
ist *der Inhalt selbst* (member-geschrieben, kommentierbar). Beide bleiben
getrennte Layer mit getrennten Datenmodellen; verzahnt nur über den
Core-Vertrag `recordActivity()` (`post.published`).

Nicht-Ziele (v1): Reactions-Emoji-Palette (comments-Votes reichen als
Resonanz-Signal), Bild-Uploads im Post (eigener Bucket → v2), wiederkehrende
Fragen per Recurrence-Regel (v2 — v1 plant Einzeltermine im Voraus),
AI-generierte Fragen („AI Cohost", Screenshot) → eigene AI-Phase, Spaces/
Rooms-Untergliederung → Spaces-Konzept.

## 2. Entscheidungen

### P1 — Ein Datenmodell, drei Typen
Eine Table `community_posts` mit `type: 'post' | 'poll' | 'question'` statt
drei Tables — Feed-Query bleibt EIN indizierter Read, der Composer ist ein
Formular mit Tabs. Poll-spezifische Felder (`pollOptions`, `pollEndsAt`)
bleiben bei den anderen Typen leer.

### P2 — Kommentare sind der comments-Layer (keine Doppel-Implementierung)
Antworten auf Posts/Fragen = `<CommentSection :target-id="post.$id"
target-type="post" />` — Komposition in der APP (A14: posts importiert
comments nicht). Threading, Votes, Mentions, Presence, Reply-Notifications
und Moderation sind damit geschenkt. `commentCount` wird NICHT am Post
denormalisiert (Cross-Layer-Write wäre String-Coupling) — die Zahl liefert
der comments-GET (`total`) beim Aufklappen; die Karte zeigt bis dahin nur
„Kommentare"-CTA.

### P3 — Poll-Votes server-autoritativ, Ergebnisse nach eigener Stimme
Table `poll_votes` (postId+userId Unique-Index, optionIndex int). Zählung
beim GET über gebündelte Count-Queries (max. 6 Optionen × limit(1)-total —
billig, kein Race-anfälliges JSON-Denormalisieren). Ergebnisse (Prozente)
sieht, wer selbst gestimmt hat oder wenn die Poll beendet ist
(`pollEndsAt`) — Anreiz zu stimmen, wie Circle. „Responses are public"
gilt: KEINE anonyme Wahl in v1 (Avatare der Stimmen wie im Screenshot sind
damit möglich, v1 zeigt nur Zahlen/Balken).

### P4 — Scheduled Questions ohne Cron: publish-on-read
`scheduledAt` in der Zukunft → `status 'scheduled'`, unsichtbar für andere.
Der Feed-GET befördert beim Lesen alle fälligen scheduled-Posts des Systems
auf `published` (Admin-Client, idempotent) — kein Cron, kein Worker, exakt
genug für Community-Fragen. Autor sieht seine geplanten Posts in einer
eigenen Warteschlangen-Ansicht (Screenshot 3 „Question Queue", ohne AI).
Recurrence („jede Woche") = v2; v1 plant N Einzeltermine im Voraus.

### P5 — Member-led + Moderation
JEDER eingeloggte User darf posten (das ist der Zweck). Schutz: Rate-Limit
(Core-Middleware, eigenes Budget), Zeichen-Limits, Markdown ohne Raw-HTML
(CommentMarkdown-Muster), Melden über den generischen moderation-Vertrag
(targetType 'post'), neue Capability `posts.moderate` (Hide/Restore wie
comments: Row-Permission-Entzug, zweiphasig). Soft-Delete durch den Autor.

### P6 — Permissions & Realtime
Rows mit `Permission.read(Role.any())` (öffentliche Community wie comments;
hidden verliert die Row-Permission). update/delete nur Autor. Poll-Votes:
KEINE breite Read-Permission (Lehre comment_votes) — eigene Stimme via API.
Realtime: Live-Insert neuer Posts über die geteilte SDK-WS (useRealtimeRows
auf community_posts), „Neue Beiträge anzeigen"-Pille statt Auto-Prepend
(Scroll-Ruhe, Muster comments.newCount).

### P7 — Verzahnung
`recordActivity('post.published', …)` beim Publish (auch verzögert via P4);
Meilenstein `milestone.posts` analog comments. GDPR-Contributor: eigene
Posts → Tombstone (Poll mit fremden Votes bleibt als „[gelöscht]" erhalten,
wie comments), eigene poll_votes → Hard-Delete. Events (Phase 22) posten
später über denselben Weg ins Ganze — der Community-Feed zeigt v1 nur
eigene Typen.

## 3. Datenmodell (Migration posts-001)

**community_posts** (rowSecurity): type (8), title (200, nullable), body
(Markdown, 10.000), authorId (36), authorName (255), status
(scheduled/published/hidden/deleted), scheduledAt (datetime, nullable),
publishedAt (datetime, nullable), pollOptions (JSON-String, max 6 Optionen
à 100 Zeichen, nullable), pollEndsAt (datetime, nullable).
Indizes: status+publishedAt (Feed-Query), authorId (GDPR/Profil),
status+scheduledAt (publish-on-read).

**poll_votes**: postId (36), userId (36), optionIndex (int).
Unique-Index postId+userId, Index postId+optionIndex (Zählung).

## 4. Routen & UI (Kurzform)

- `GET /api/posts` (published, Cursor, publish-on-read vorab; myVote je
  Poll aus EINEM Query), `POST /api/posts` (auth, Zod-Factory je Typ,
  Rate-Limit), `PATCH/DELETE /:id` (Autor; Poll nach erster Fremdstimme
  nicht mehr editierbar), `POST /:id/vote` (Toggle/Wechsel bis pollEndsAt),
  `POST /:id/hide|restore` (posts.moderate), `GET /api/posts/scheduled`
  (eigene Warteschlange).
- UI: Seite `/community` (Feed + Composer mit Tabs Post/Umfrage/Frage +
  „Planen"-Datumsfeld), `PostCard`/`PollCard` (Balken, Countdown)/
  `QuestionCard` (Frage-Stil prominent), Kommentare aufklappbar (App bindet
  CommentSection), „Neue Beiträge"-Pille; Dashboard `dashboard/posts`
  (Moderation + globale Scheduled-Queue) via `maui.admin.modules`.
- i18n de+en; alle Strings Keys; Zod als `create*Schema(t)`-Factories.

## 5. Offene Entscheidungen (vor dem Goal fixieren oder im Goal annehmen)

1. Seiten-Name `/community` vs. `/` der künftigen Community-App —
   v1-Annahme: eigene Seite `/community` in reddit-comments als Pilot.
2. Poll-Ergebnis-Sichtbarkeit vor eigener Stimme (P3-Default: verdeckt) —
   ok?
3. Gäste sehen den Feed (read any), dürfen aber nichts (posten/stimmen/
   kommentieren erst nach Login) — ok?

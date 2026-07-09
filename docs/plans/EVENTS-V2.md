# Plan: Events v2 — Kalender, Landing Pages, Live, Replays, Reminder, Paid-Vorbereitung

> Stand: 2026-07-09 · Status: **KOMPLETT umgesetzt** (E1+E2 = Phase 26 ✅, Feinschliff §7b ✅, E3+E4 = Phase 27 ✅, Serien §7e ✅ 2026-07-09) · Baut auf `packages/events` (GOALS Phase 22 ✅) auf.
> Phase 23 (Billing) dockt an: Guard ist in der App verdrahtet (hasEventTicket) — der Webhook ruft NUR noch `grantEventTicket()` auf.
> Referenzen: [CONCEPT.md](../CONCEPT.md) (A14), [BILLING-STRIPE.md](BILLING-STRIPE.md)
> (Phase 23 — der Paid-Andockpunkt), `packages/posts` (Storage-/Moderations-Muster),
> Vorbild-Idee: Circle.so Events (5 Referenz-Screenshots, §1) — bewusst auf die
> maui-Architektur umgeformt (Leitplanke, keine Kopie).

## 1. Referenz-Analyse (Circle.so-Screenshots)

Was die Screens strukturell zeigen — und was davon bei uns schon steht:

**S1 — Mobile Event-Liste + Detail-Sheet (branded App):**
Liste „Events & Watch Parties" mit Filter-Dropdown („Upcoming"), **Monats-Gruppierung**
(March/April), pro Zeile: Serien-Thumbnail, `Do, 20. Mär · 9am` (+ Recurrence-Icon 🔁),
Titel, **Avatar-Stack + „115 Going"**. Detail-Sheet: **Cover-Image**, Datum-Block
(28 MAR), Titel, Meta-Zeilen (Wochentag + Zeitfenster, 📍 „Live Video"),
Avatar-Stack + Count, vollbreiter **„RSVP ▾"-Dropdown-Button**, Beschreibung.
*Bei uns:* Zeit/Ort/Count/Datum-Block existieren (EventCard/EventDetail); es fehlen
Cover, Avatar-Stack, Monats-Gruppierung, „Live Video" als Ortstyp.

**S2 — Desktop-Landing-Page:**
Großes Cover-Banner, grüne Pill **„Starts in 2 weeks"** (Countdown), H1,
**„Hosted by …" mit Avatar**, Engagement-Zeile (Like 6 · Kommentare 17 · Bookmark ·
Share · „Liked by Daniel and 5 others"), **Sidebar-Karte**: Datum-Block, Zeitfenster,
Ort (verlinkt + Adresse), **Ticket-Icon „$199"**, primärer CTA **„Purchase ticket"**.
*Bei uns:* Detailseite existiert; es fehlen Cover, Countdown-Pill, Host-Avatar,
Share, Preis + Ticket-CTA. Kommentare haben wir (comments-Layer im Slot) — Likes/
Bookmarks haben wir bewusst nicht.

**S3 — Monats-Kalender + RSVP-Karte:**
Monatsgrid mit Wochentags-Spalten, **mehrtägige Events als durchgehender Balken**
(„Workshop sessions", 4.–6.), Einzel-Events als Pills, Monats-Navigation ‹ ›.
Overlay-Karte: Datum-Block, Typ-Zeile „Live stream" (Kamera-Icon), Status-Dropdown
**„✓ Going ▾"**, Gradient-CTA **„Join live"**.
*Bei uns:* nur Listen-Ansicht — Kalender-View fehlt komplett; „Join live" fehlt.

**S4 — Events-Widget in der Community (Clarity):**
Listenzeilen mit Thumbnail, Titel, Datum, Typ „Live stream", **RSVP-Dropdown pro
Zeile** („Going" / „Not going"), **Knappheits-Labels**: „Only a few spots left"
(orange) und „This event is full".
*Bei uns:* „Ausgebucht"-Badge existiert; „Nur noch wenige Plätze" fehlt.

**S5 — Automations-Flow:**
Trigger „Send event reminder 1hr ago" (+ Audience-Filter, AI-Filter) → Action
„Bot sendet Direct Message" → DM-Preview.
*Bei uns:* kein DM-System, kein Automation-Builder — das **Prinzip** (Erinnerung
kurz vor dem Event an Zusager) übernehmen wir über den bestehenden
`notify()`-Vertrag, nicht die Mechanik.

## 2. Leitplanken-Entscheidungen

(a) bauen · (b) Prinzip übernehmen, anders bauen · (c) bewusst später · (d) ablehnen

| Referenz-Feature | Entscheidung | Begründung |
|---|---|---|
| Cover-Image pro Event | **(a) E1** | Bucket `event-covers` (Magic-Bytes-Check wie `fonts`), macht die Landing Page zur „Bühne" |
| Host-Avatar, Teilnehmer-Avatar-Stack | **(a) E1** | `resolveAvatars()` existiert; Stack = Top-N going-RSVPs |
| Countdown-Pill („Starts in 2 weeks") | **(a) E1** | rein client-seitig aus `startAt`, i18n-relativ |
| Knappheit („Nur noch X Plätze") | **(a) E1** | `capacity - attendeeCount <= 3` — Zahlen sind schon live (Realtime) |
| Share/Promote | **(a) E1** | Copy-Link + `navigator.share`; ICS + Feed-Announce existieren |
| Monats-Kalender-View | **(a) E1** | zweite Ansicht auf `/events` (Liste bleibt Default); Einfachheit: Pills pro Tag, mehrtägig = Pill an jedem Tag im Fenster, KEINE absolut positionierten Balken |
| Monats-Gruppierung der Liste | **(a) E1** | reine Anzeige-Logik |
| Ortstyp „Live Video" vs. Adresse | **(a) E2** | `locationType 'venue'/'online'` (additiv); `url` wird der Join-Link |
| „Join live"-Button | **(a) E2** | erscheint T−15 min bis Ende für Zusager (client-seitig aus `startAt`/`endAt`) |
| Live-Embed (YouTube/Twitch/Vimeo) | **(a) E2, Gate** | Provider-Erkennung aus URL; Embed nur für Embed-fähige Provider, sonst externer Link. app.config-Gate `maui.events.embed` (Default aus — CSP/Consent!) |
| Replays („Events that live on") | **(a) E2** | `replayUrl` (additiv), Archiv zeigt „Replay ansehen" — die Event-Seite selbst IST der bleibende Content (SSR, verlinkbar, kommentierbar) |
| RSVP-Reminder | **(b) E3** | Kein Cron: **on-read Reminder-Sweep** (Muster `publishDuePosts`) + `notify()` an Zusager; Appwrite-Messaging/E-Mail als dokumentierter Andockpunkt (scheduled Function, Scaffold aus Track 2B) |
| Reminder als Bot-DM + AI-Audience-Filter | **(d)** | kein DM-System, kein Automation-Builder — `notify()` deckt das Bedürfnis |
| RSVP-Dropdown statt 3 Buttons | **(d)** | die 3 Buttons (Phase 22) sind explizit + barrierearm; Dropdown spart nichts |
| Likes/Bookmarks auf der Event-Seite | **(d)** | kein Like-System im Projekt; Resonanz = Kommentare + RSVP-Zahl |
| Recurrence (🔁 Serien) | **(d)** | Phase-22-Constraint bleibt: Einzeltermine, Serien = mehrere Events |
| „Invite by space/profile/name" | **(d)** | kein Spaces-Konzept; Einladen = Link/ICS teilen |
| Paid Events (Ticket, „$199", Purchase-CTA) | **(b) E4 vorbereiten** | Schema + Vertrag + UI-Zustände JETZT, Checkout kommt aus Phase 23 — §5 |
| Circle Live Rooms (eigenes Video-Hosting) | **(d)** | explizites Nicht-Ziel seit Phase 22: kein Video-Hosting, nur externe URLs |

## 3. Datenmodell — ausschließlich ADDITIV (Migration events-002)

`events` bekommt neue nullable Spalten (kein Schema-Bruch, Bestandsrows bleiben gültig):

| Spalte | Typ | Zweck |
|---|---|---|
| `coverFileId` | varchar 36, null | Datei im Bucket `event-covers` |
| `locationType` | varchar 8, null | `'venue'` \| `'online'` — null ⇒ Ableitung: `url` gesetzt → online, sonst venue (Bestandsdaten) |
| `replayUrl` | varchar 500, null | Aufzeichnung nach dem Event |
| `remindersSentAt` | datetime, null | Idempotenz-Flag des Reminder-Sweeps (E3) |
| `access` | varchar 8, null | `'free'` (Default/null) \| `'paid'` (E4) |
| `priceAmount` | integer, null | Cent-Betrag, nur Anzeige — die Wahrheit lebt später in Stripe (lookup_key) |
| `priceLookupKey` | varchar 64, null | Stripe-Price-Referenz (Muster BILLING-STRIPE B5: planId→lookup_key) |

Neue Table `event_tickets` (E4, von Anfang an im Endschema — Phase 23 muss NICHTS migrieren):
`eventId` + `userId` (Unique), `status` (`'paid'`/`'refunded'`), `stripeSessionId` null,
`amount` int null. Row-Security: `read(user:<userId>)`, Writes NUR Admin-Client
(Muster `billing_*`-Tables aus BILLING-STRIPE).

Neuer Bucket `event-covers` (Migration legt an): WebP/JPEG/PNG, Magic-Bytes-Check
serverseitig (Muster `fonts`-Bucket), max ~2 MB, `read(any)` auf Datei-Ebene beim
Publish (Cover sind öffentlich wie die Seite).

## 4. Verträge & Layer-Grenzen (A14)

- **Reminder**: events ruft `notify()` (Core) pro Zusager — kein neues System.
  Trigger: Sweep in `GET /api/events*` (best-effort, Admin-Client): Events mit
  `status published AND startAt <= now+24h AND remindersSentAt IS NULL` →
  `remindersSentAt` setzen (zuerst! Idempotenz), dann alle going-RSVPs notifizieren.
  Trade-off dokumentiert: besucht niemand die Seite, feuert nichts — der spätere
  Lückenschluss ist eine **scheduled Appwrite Function** (Scaffold existiert,
  Track 2B), die dieselbe Server-Route `POST /api/events/reminder-sweep`
  (interner Key-Schutz) aufruft. E-Mail/Push via Appwrite Messaging = eigener
  Andockpunkt, bewusst NICHT in diesem Plan.
- **Paid-Zugang**: `registerEventTicketGuard()` in
  `events/server/utils/eventTickets.ts` (Registrierungsmuster wie
  `registerUserDataContributor` / geplantes `registerCourseAccessGuard`,
  Phase 24). `assertCanRsvp(event, row)`: `access 'paid'` → delegiert an den
  registrierten Guard; **ohne Guard fail-closed 403**. Die APP registriert den
  Guard in Phase 23 und ruft darin billings Ticket-/Checkout-Logik auf —
  events importiert NIE aus billing.
- **Checkout-Flow (Phase 23, hier nur der Vertrag)**: „Ticket kaufen"-CTA →
  `POST /api/billing/checkout` mit `priceLookupKey` + `metadata { eventId }`;
  der Billing-Webhook schreibt bei `checkout.session.completed` die
  `event_tickets`-Row über eine von events **exportierte** Server-Utility
  `grantEventTicket(event, { eventId, userId, stripeSessionId, amount })`
  (explizite, typisierte Schnittstelle — billing kennt kein events-Schema).
- **Feed**: zusätzlich `event.replay_published` (additiv zur i18n-Typenliste).
- **GDPR**: Contributor erweitert — Export + Hard-Delete der eigenen
  `event_tickets` (Kauf-Metadaten, keine Rechnungsdaten — die liegen bei Stripe).

## 5. Paid Events — was JETZT entsteht vs. was Phase 23 verbindet

**Jetzt (E4):** Schema (§3), Guard-Vertrag (§4), UI-Zustände:
Preis-Badge auf Card + Sidebar-Karte der Landing Page (Format via
`useFormatCurrency`, existiert im Core), CTA-Slot „Ticket kaufen" — solange kein
Guard registriert ist: Button disabled + Hinweis „Bald verfügbar" (i18n), RSVP
„going" auf paid-Events → 403 fail-closed (maybe/declined bleiben frei).
Admin-Formular: Access-Toggle free/paid + Preisfelder (nur sichtbar wenn paid).

**Phase 23 verbindet:** Guard-Registrierung in der App, Checkout-Route, Webhook →
`grantEventTicket()`, CTA wird aktiv. Events-seitig ist dann NICHTS mehr zu bauen.

**Bewusst abgelehnt:** eigene Preis-/Steuer-Logik im events-Layer (Stripe ist die
Wahrheit), Mehrfach-Tickets/Sitzplätze (1 Ticket = 1 User = 1 going-RSVP),
Refund-UI (v1: Stripe-Dashboard).

## 6. Live-Plattformen (Ideen-Katalog)

Join-Link (`url`) ist bewusst provider-agnostisch. Erkennung nur für Icon/Embed:

| Kategorie | Provider | Verhalten |
|---|---|---|
| Meeting | Google Meet, Zoom, MS Teams, **Jitsi (self-hosted!)**, Whereby, Discord-Voice/Stage | externer Link („Join live" öffnet neuen Tab) |
| Stream (embedbar) | YouTube Live, Twitch, Vimeo, **OwnCast (self-hosted!)**, Kick | optional Inline-Embed im Live-Fenster (Gate `maui.events.embed`) |
| Sonstiges | **LinkedIn Live**, Restream, StreamYard, beliebige URL | externer Link, generisches Icon |

**Erstklassige Provider (Entscheidung David, 2026-07-07):** Google Meet, Twitch,
YouTube + **Jitsi Meet**, **OwnCast**, **LinkedIn Live** — diese sechs bekommen
eigene Icons + Erwähnung in der Admin-Formular-Hilfe („Link von Meet, Jitsi,
Twitch, YouTube, OwnCast oder LinkedIn Live einfügen"); alles andere läuft über
die generische URL. Jitsi + OwnCast passen zur Self-Hosting-Linie des Projekts
(Appwrite self-hosted) — keine technische Sonderbehandlung, nur Sichtbarkeit.

## 7. Phasenschnitt (jede Stufe einzeln shipbar)

- **E1 „Bühne"**: Migration 002 (nur Cover-Spalte + Bucket), Cover-Upload im
  Admin-Formular, Landing-Ausbau (Cover, Host-Avatar, Avatar-Stack, Countdown-Pill,
  Knappheits-Label, Share), Monats-Gruppierung + Kalender-View.
- **E2 „Live & Replay"**: `locationType`/Join-Fenster/„Join live", Provider-Icons,
  Embed hinter Gate, `replayUrl` + Archiv-Badge, `event.replay_published`.
- **E3 „Reminder"**: Sweep + `notify()` an Zusager, `remindersSentAt`,
  interner Sweep-Endpoint als Function-Andockpunkt.
- **E4 „Paid-Vorbereitung"**: `event_tickets` + access/price-Spalten,
  `registerEventTicketGuard` + `grantEventTicket`, UI-Zustände, fail-closed-Beweis.

GOALS.md: Phase 26 = E1+E2, Phase 27 = E3+E4 (Reihenfolge 26 → 27; Phase 23
kann danach oder parallel ab E4-Abschluss andocken).

## 7b. Feinschliff-Paket (David-Review nach E1+E2, umgesetzt 2026-07-07)

Nach dem Phase-26-Review kamen Meetup.com-Referenzen dazu — umgesetzt:
Cards vertikal im Grid (Cover + „Kostenlos"-Badge, Datums-**Spanne** mit
„Mehrtägig"-Badge, Online/Vor-Ort-Zeile, „von {Organizer}", Avatar-Reihe);
Detailseite zweispaltig (Zurück-Link, sticky Info-Karte, „So findest du
uns" = address-Spalte als Google-Maps-Link + locationNotes-Freitext);
Beschreibung als **Markdown** (MarkdownContent, kein Raw-HTML) mit
ContentClamp („Mehr/Weniger"); Up-/Downvotes (event_votes, Muster
post_votes, Migration 003) auf Card + Detail; Teilnehmerliste mit Namen —
**Privacy-Gate: nur eingeloggt** (Gäste sehen Anzahl + geblurte
Platzhalter, API liefert ihnen keine userIds); Titel-Suche (?q,
Fulltext-Index); Melden über den generischen moderation-Vertrag
(targetType 'event'). Kategorien bewusst ABGELEHNT (zu wenige Events,
Entscheidung David); Serien über nicht-zusammenhängende Tage bleiben
mehrere Einzel-Events (Recurrence-Ablehnung gilt weiter).

## 7c. Filter-Paket (David-Review, umgesetzt 2026-07-08)

- **Zeit-Chips**: Kommende · **Heute · Morgen · Wochenende** (Client rechnet
  die lokalen Fenster und nutzt die bestehende Range-Query) · Archiv.
- **Meine-Chips (nur eingeloggt, `?mine=`)**: **Zugesagt** (kommende
  going-RSVPs), **Geliked** (eigene Upvotes), **Teilgenommen** (going +
  vorbei — der Unterschied zum Archiv: nur MEINE besuchten Events).
  Gäste → 401; Kappung auf die jüngsten 100 RSVPs/Likes dokumentiert.
- **Share auf der Card** (neben den Votes, die seit §7b dort sitzen).

## 7d. Zweispalten-Layout (David-Review, umgesetzt 2026-07-08)

Der Listen/Kalender-**Switch ist raus** (die Filter wirkten in der
Kalender-Ansicht nicht, und Platz ist da): `/events` zeigt links die
gefilterte Liste (einspaltig), rechts DAUERHAFT den Monats-Kalender
(sticky, eigene Monats-Navigation; mobil unter der Liste). **Card-Hover
hebt die Pills des Events im Kalender hervor** (mehrtägig = alle Tage).
Filter/Suche steuern bewusst nur die Liste — der Kalender ist die
Monats-Übersicht.

## 7e. Event-Serien / Recurrence (Go David 2026-07-09) ✅ umgesetzt 2026-07-09

**Entscheidung: Master + MATERIALISIERTE Instanzen** (nicht virtuelle
Regel-Expansion): Der Master ist eine normale Event-Row mit `recurrence`
(weekly | biweekly | monthly) und zugleich Termin #0 (`seriesId` = eigene Id,
`seriesIndex` 0); Instanzen sind ECHTE Event-Rows (Kopien der Master-Felder,
`seriesId` → Master, fortlaufender `seriesIndex`). Dadurch funktionieren
RSVP/Kapazität/Kommentare/Votes/Reminder/ICS/Tickets unverändert PRO Termin.

- **Rolling Window**: Expansion bis 120 Tage voraus, max. 26 Instanzen je
  Lauf; Top-up on-read in der öffentlichen Liste (Muster publish-on-read),
  idempotent über `seriesGeneratedUntil` am Master (Marker zuerst).
- **Nach der Erzeugung ist jede Instanz eigenständig** (Antwort auf die
  Triage-Rückfrage): einzeln editier-/absagbar; Master-Edits propagieren
  bewusst NICHT rückwirkend (v1-Einfachheit). Cover propagiert beim Upload
  auf Instanzen ohne eigenes Cover.
- **Serie beenden** (eigene Route): setzt `seriesUntil` = jetzt (Regel
  stoppt) und sagt künftige Instanzen soft ab; Vergangenheit bleibt.
- **Feed**: nur der Master announced `event.published` — Instanzen spammen
  den Feed nicht.
- Monatsregel: gleicher Monatstag, bei kürzeren Monaten geklemmt auf den
  letzten Tag. `seriesUntil` (optional) begrenzt die Serie hart.
- Migration events-005 (additiv): recurrence, seriesId, seriesIndex,
  seriesUntil, seriesGeneratedUntil + Index (seriesId, startAt).

## 8. Offene Entscheidungen (David)

1. **Embed-Gate**: ✅ **Entschieden (2026-07-07): erstmal AUS** — v1 nur externe
   Links, das Gate `maui.events.embed` bleibt Core-Default false und wird auch
   in der App nicht aktiviert. Erstklassige Provider s. §6.
2. **Reminder-Vorlauf**: ✅ **Entschieden (2026-07-07): 24 h vor Start** —
   ein Sweep, ein Idempotenz-Flag (`remindersSentAt`).
3. **Preis-Sichtbarkeit vor Phase 23**: ✅ **Entschieden (2026-07-07):
   sichtbar, fail-closed** — Preis-Badge + „Ticket kaufen (bald verfügbar)",
   going-RSVP auf paid ohne Guard → 403.
4. **Cover-Pflicht**: ✅ **Entschieden (2026-07-07): optional mit Fallback** —
   ohne Upload rendert eine Theme-Farbfläche mit Datum-Block.

Damit sind alle §8-Entscheidungen fixiert — Phase 26/27 können ohne
Rückfragen starten.

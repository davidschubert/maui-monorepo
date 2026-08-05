# Discussions — Produkt-Konzept

**Teil 1** (2026-07-27) konserviert Davids Produkt-Entscheidungen. **Teil 2**
(2026-08-03, unten) ist der Schnitt-Entwurf: was davon heute noch trägt, wo die
Grenze zu `posts` wirklich verläuft, und welche drei Entscheidungen vor dem
ersten Commit fallen müssen.

Status: **entscheidungskomplett (3.8); Stufen 1–4 gebaut** — der Baustand steht
in Teil 5 ganz unten.

---

## Teil 1 — Davids Entscheidungen (2026-07-27)

## Was es ist (Davids Worte, sinngemäß)

Ein Mittelding zwischen geführtem Forum und Reddit:

- Der **Admin legt Kategorien fest** (z. B. „pukalani", „gsap") — Struktur ist
  Admin-Sache, Mitglieder können KEINE Kategorien anlegen.
- **Mitglieder eröffnen Threads** innerhalb einer Kategorie.
- **Threads werden kommentiert** — über den normalen comments-Andockpunkt
  (targetType 'thread'), verdrahtet im site-Layer wie überall sonst.

Abgrenzung zu posts (Feed): Feed = ein Strom, alle posten durcheinander.
Discussions = Admin-Struktur + Threads. Beide nutzen comments darunter.

## Naming

- Kundenname: **Discussions / Diskussionen** (Landing nutzt das Wort schon).
- „Threads" vermieden (Meta-Produktname), „Forum" vermieden (klingt 2005).
- Code-Key beim Bau festlegen (Vorschlag: `discussions`); Kollision mit dem
  bisherigen Landing-Wording „Diskussionen" (dort = comments-Baustein) beim
  Baustart auflösen.

## URL-Schema (entschieden)

```
/discussions/<kategorie>                      z. B. /discussions/pukalani
/discussions/<kategorie>/<id>/<slug>          z. B. /discussions/pukalani/1v7ornq/polipoli-open-yet
```

- **Die ID ist die Wahrheit** (kurz, unveränderlich). Der Slug ist Deko für
  Menschen/SEO und wird aus dem Titel abgeleitet.
- Titel-Änderung ⇒ neuer Slug, alte Links bleiben gültig: der Server löst nur
  über die ID auf und leitet bei falschem/alten Slug per 301 auf die
  kanonische URL um (Reddit-/StackOverflow-Muster; genau dafür trägt Reddit
  die ID in der URL).

**Ergänzung (2026-08-03, Davids Frage „Kategorie in die URL?"):** dieselbe
Regel gilt für das KATEGORIE-Segment. Der Server löst AUSSCHLIESSLICH über die
ID auf; stimmt Kategorie ODER Slug nicht mehr, antwortet er 301 auf die
kanonische URL. Damit ist Umkategorisieren gratis (alte Links leiten für immer
um — nötig, weil der Teil-3-Katalog TL3 das Umkategorisieren als Routine-Recht
gibt) und es entsteht kein Duplicate Content (nicht-kanonische Varianten
rendern nie, die Seite trägt ihr Canonical-Tag). Die SEO-Abwägung ist bewusst
KEIN Grund für das Schema: Keywords im Pfad sind ein schwaches Signal, ein 301
gibt Ranking vollständig weiter — die Kategorie steht für MENSCHEN im Link
(wer den Link geteilt bekommt, weiß vor dem Klick, wo er landet). Zum
Vergleich: Discourse und StackOverflow haben die Kategorie NICHT in der
Topic-URL; Reddit hat sie, dort kann ein Beitrag aber nie umziehen.

Der eine Link, der sich NICHT selbst heilt, ist die Kategorie-SEITE
(`/discussions/<kategorie>` — keine Topic-ID zum Auflösen). Deshalb für
Stufe 1: Kategorie-NAME frei änderbar, Kategorie-SLUG nach Anlage fest —
dasselbe Muster wie beim pages-Layer („Später nicht änderbar").
Slug-Umbenennung mit Alt-Slug-Gedächtnis ist eine spätere Ausbaustufe, falls
je gebraucht.

## Nicht verhandelbare Rahmenbedingungen (aus der Bilanz / Davids Prinzip)

- Konzept existiert EINMAL (eigener Layer), Komposition im site-Layer.
- Von Tag 1 durch die Datentür (`tenantDb`, tenantId, ESLint-Liste,
  Pool-Unique-Indizes mit tenantId) — kein Silo-Umweg wie bei events/courses.
- Produkt-Gate über `pukalani.tenancy.products` (Tarif-Zuordnung entscheidet David
  beim Baustart); An/Aus-Schalter im Dashboard als **USwitch** (nicht Checkbox).
- Nur Erscheinung ist mandanten-variabel (Theme/Schrift), Verhalten nie.

---

# Teil 2 — Schnitt-Entwurf (2026-08-03)

> **Hinweis (noch am 2026-08-03):** Teil 3 unten erweitert den Funktionsumfang
> erheblich — die Messung „zwei Zeilen Unterschied zu posts" und die
> Aufwandsangabe „Tage" gelten seither nur noch für den KERN. Was der
> Vollausbau bedeutet, steht in Teil 3 unter „Was das am Schnitt ändert".

## Zuerst: das Konzept spricht eine Sprache, die es nicht mehr gibt

Teil 1 ist vom 2026-07-27 und nennt als Rahmenbedingungen „Komposition im
site-Layer" und „`tenantId`". Beides existiert so nicht mehr: die Komposition
gehört seit dem 2026-07-27 dem **blueprint**-Layer, und die Spalte heißt seit
E8-3 **`communityId`**. Ebenfalls unbekannt sind dem Text A5 (Mitgliedschaft als
Ereignis), C18 (Publikum je Community), M13 (Sperre friert Inhalte ein) und die
Trennung `as`/`actor` an der Datentür. Nichts davon kippt das Produkt — aber
niemand sollte danach bauen, ohne es zu übersetzen.

## Die Frage, die vor dem Datenmodell steht

**Was genau hätte Discussions, das `posts` heute nicht hat?** Nachgemessen statt
behauptet:

| | posts (heute) | Discussions (Konzept) |
|---|---|---|
| Beitragsarten | `post` · `poll` · `question` | Thread |
| Titel | ja (optional) | ja |
| Text | ja | ja |
| Auf/Ab-Stimmen | ja (`upvotes`/`downvotes`/`score`) | implizit erwartet |
| Kommentare darunter | ja (`targetType: 'post'`) | ja (`targetType: 'thread'`) |
| Moderation | Queue, `hidden`, Melde-Ziel | müsste entstehen |
| Planen/Entwurf | ja (`scheduled`) | — |
| **Kategorie** | **nein** | **ja, vom Admin gepflegt** |
| **Darstellung** | EIN Strom (Feed) | nach Kategorie gegliedert |

Der Unterschied schrumpft auf **zwei Zeilen**: eine Kategorie-Dimension und
eine nach ihr gegliederte Darstellung. Alles Übrige — Threads, Kommentare,
Stimmen, Moderation, Melde-Weg, Datentür, GDPR-Beitrag — steht in `posts` schon
und wurde dort in den letzten Wochen gehärtet.

## Drei Wege

**A — eigener Layer** (die stille Annahme von Teil 1). Eigene Tabellen, Routen,
Moderation, Melde-Ziel, Produkt-Gate. Ehrlicher Aufwand: **Wochen**. Der Preis
ist nicht die erste Version, sondern die zweite: zwei fast gleiche Produkte
driften auseinander, und jede Härtung (wie F15 gerade bei events) muss zweimal
gebaut werden. Genau davor warnt die Produkt-Bilanz.

**B — Kategorie als Dimension von `posts`, Discussions als eigene Ansicht.**
Eine vom Admin gepflegte Kategorien-Tabelle, ein optionales `categoryId` am
Beitrag, dazu die Routen und Seiten aus Teil 1 (`/discussions/<kategorie>/…`).
Ein Datenmodell, eine Moderation, ein Melde-Ziel. Aufwand: **Tage**. Discussions
ist damit ein Struktur- und Darstellungsprodukt auf `posts`, kein zweites
Forum daneben.

**C — nicht bauen.** Feed plus Kommentare decken kleine Communities ab. Für
zehn Mitglieder ist eine Kategorienstruktur Ballast.

**Meine Empfehlung: B.** Sie liefert genau das, was Teil 1 als Produkt
beschreibt — Admin besitzt die Struktur, Mitglieder eröffnen Threads, darunter
hängen Kommentare —, ohne die Hälfte von `posts` ein zweites Mal zu bauen. Und
sie ist umkehrbar: stellt sich heraus, dass Discussions doch ein eigenes Wesen
hat, ist die Kategorie-Spalte kein Hindernis, sondern der Migrationspfad.

## Die drei Entscheidungen, die David treffen muss

1. **Weg A, B oder C.**
2. **Wenn B: Wo erscheint ein kategorisierter Beitrag?** Entweder bleibt der
   Feed der Strom über ALLES (Discussions ist ein Filter darauf) — oder ein
   Beitrag mit Kategorie verlässt den Feed und lebt nur noch in seiner
   Kategorie. Das ist keine technische Frage: sie entscheidet, ob eine
   Community einen Ort hat oder zwei.
3. **Der Name.** Die Landingpage benutzt „Diskussionen" heute schon — für den
   Kommentar-Baustein. Zwei Dinge unter einem Wort ist genau die Sorte
   Verwechslung, die E11 („Produkte" statt „features") gerade beseitigt hat.
   Entweder bekommt der Kommentar-Baustein auf der Landing ein anderes Wort,
   oder das Produkt heißt anders.

## Erster Schnitt, wenn B gewählt wird

Gebaut wird in dieser Reihenfolge, jede Stufe für sich lauffähig:

1. Kategorien-Tabelle (`communityId`, Name, Slug, Reihenfolge, aktiv) +
   Verwaltung im Dashboard hinter `posts.manage`. Ohne Kategorien ändert sich
   für niemanden etwas.
2. `categoryId` am Beitrag (additiv, optional) + Auswahl beim Verfassen.
3. Die Seiten aus Teil 1 samt URL-Schema — inklusive der 301-Regel für den
   veralteten Slug, denn die ist der Grund, warum die Id in der URL steht.
4. Produkt-Gate `discussions` in `pukalani.tenancy.products` + Schalter im
   Dashboard.

**Ausdrücklich NICHT im ersten Schnitt:** Unterkategorien, Anheften, Sperren
eines Threads, „gelöst"-Markierung, Suche über Kategorien hinweg,
Benachrichtigung bei neuen Threads einer Kategorie. Jedes davon ist für sich
klein — zusammen sind sie das, was aus einem Schnitt ein Projekt macht.

## Was der Bau NICHT neu erfinden darf

Kategorien sind mandantengebunden: `communityId` an der Tabelle, Slug-Unique
**nur zusammen mit** `communityId` (Pool-Regel), Zugriff ausschließlich über
`tenantDb`, Melde-Weg über die bestehende Registry (`registerReportTarget`),
Moderation über die vorhandene `posts`-Queue. Wer hier etwas Eigenes baut,
baut die nächste F15.

---

# Teil 3 — Funktionskatalog (Davids Vorgaben, 2026-08-03)

David hat den Zielumfang konkretisiert. Das Vorbild ist erkennbar **Discourse**
— die Badge-Texte sind wortgleich dessen Standard-Katalog. Das ist als Spezifi-
kation vollkommen brauchbar; zwei Konsequenzen gehören aber ausgesprochen:
die TEXTE werden beim Bau eigenständig formuliert (wortgleiche Übernahme wäre
fremde Produktkopie, und sie müssen ohnehin nach de+en), und einige Kriterien
setzen Discourse-Funktionen voraus, die es hier nicht gibt — die stehen unten
je Stelle als **[fehlt: …]** und sind Teil der Aufwandsrechnung, nicht Kleingedrucktes.

## 3.1 Topics — die Startseite

Tabellenansicht (UTable, B6) mit den Spalten:

| Spalte | Inhalt |
|---|---|
| **Topic** | Headline, darunter die Kategorie |
| **Users** | Avatare der Beteiligten (gepostet oder geantwortet) |
| **Replies** | Anzahl Antworten |
| **Views** | Anzahl Aufrufe **[fehlt: Aufruf-Zählung je Topic]** |
| **Activity** | letzte Aktivität, relativ („16min ago", „5h ago", „30 days ago", „Jul 3") |

**Sortierung:** `Hot` · `Latest` · `Categories` · `Top`. Bei `Top` zusätzlich
der Zeitraum: All time · Year · Quarter · Month · Week · Today.
`Categories` wechselt in eine eigene Tabelle: **Category** (Name +
Beschreibung) | **Topics** (Anzahl, z. B. 8 · 322 · 1332 · 8843).

**Seitenleiste, dauerhaft:** die wichtigsten 5 Kategorien ODER die letzten 5,
in denen ich selbst gepostet/kommentiert habe (Entscheidung beim Bau, s. 3.7),
plus ein sechster Link „All categories".

## 3.2 Filter

„Filter topics by category, tag, or other criteria":

- `category` — Topics einer Kategorie
- `created-after` — Datum (YYYY-MM-DD) oder „vor N Tagen"
- `order` — Sortierfeld
- `status` — Topic-Zustand **[fehlt: Topic-Zustände open/closed/archived —
  posts kennt nur scheduled/published/hidden/deleted]**
- `users` — nach Beteiligten

## 3.3 Suche

Drei Bereiche: **Topics/Posts** · **Categories** · **Users**. Dazu aufklappbare
erweiterte Filter:

- Categorized (Dropdown: All categories, …)
- posted before/after (Datumsfeld)
- only return topics/posts: are the very first post · are pinned **[fehlt:
  Anheften]** · are wiki **[fehlt: Wiki-Beiträge]** · include images ·
  matching in title only
- where topics: any · open · closed · public · archived **[fehlt: alle vier
  Zustände]** · have zero replies · contain a single user · are solved ·
  are unsolved **[fehlt: „gelöst" — stand in Teil 2 ausdrücklich NICHT im
  ersten Schnitt; mit dieser Vorgabe wird es Ausbaustufe statt Ablehnung]**
- posted by (User-Suche) · posts (min/max) · views (min/max)

## 3.4 About-Seite des Discussions-Bereichs

- Beschreibungstext + Kontakttext + Möglichkeit, übergeordnet jemanden zu
  kontaktieren
- Zahlen: Anzahl User · Admins · Moderatoren · Startdatum („Created 2 months
  ago")
- Liste der Admins mit Profil-Link, Liste der Moderatoren mit Profil-Link
- Site activity: „58 topics in the last 7 days" · „87 posts today" · „639
  active users in the last 7 days" · „339 sign-ups in the last 7 days"
  (= Beitritte, messbar über community_members/A5) · „47.5k likes all time"

## 3.5 Regelwerk-Seiten (drei Navigationspunkte)

**Guidelines** · **Terms of Service** · **Privacy** — jeweils Text, vom
Community-Owner im Dashboard editierbar, beim Bau mit Beispieltext vorbefüllt.

Mechanik: NICHT neu erfinden — der `pages`-Layer kann genau das (editierbare
Textseiten, mandantengebunden seit pages-004, MEDIUMTEXT-Body, Dashboard-
Verwaltung). Der Bau ist im Kern ein Seed dreier Seiten je Community plus die
Navigation im Discussions-Bereich.

**Eine Rechtsfrage gehört vorher zu David:** eine je Community editierbare
„Privacy"-Seite auf Betreiber-Infrastruktur berührt die Betreiber-Rechtstexte
(A1). Wer haftet für das, was ein Owner dort schreibt — und wie stellt die
Seite klar, dass sie NEBEN der Betreiber-Datenschutzerklärung steht und sie
nicht ersetzt?

## 3.6 Badges

Vier Gruppen; einige mehrfach verleihbar (welche genau, wird beim Bau je Badge
festgelegt — Davids Hinweis: „some of them multiple times"). Kriterien mit
allen Zahlen; **[fehlt: …]** = setzt Nichtvorhandenes voraus.

**Vorab die eine Modell-Frage, an der die halbe Tabelle hängt:** die Kriterien
sprechen durchgehend von **Likes** (Herz), unser Bestand ist überall
**Auf/Ab-Stimmen** (posts UND comments: upvotes/downvotes/score). Entweder
zählt „Like" = Upvote (dann sind Downvotes badge-neutral), oder es kommt ein
echtes Herz NEBEN die Stimmen (zweites Signal, neue Tabelle). Das ist
Entscheidung Nr. 4 in 3.7 — ohne sie ist keine der Like-Zeilen baubar.

### Getting started

| Badge | Kriterium |
|---|---|
| Autobiographer | Profil ausgefüllt + Profilbild |
| Certified | Neuling-Tutorial abgeschlossen **[fehlt: interaktives Tutorial]** |
| Editor | ersten eigenen Beitrag bearbeitet |
| First Emoji | erstes Emoji im Beitrag **[fehlt: Emoji-Picker im Editor]** |
| First Flag | erste Meldung (Melde-Weg existiert) |
| First Like | erstes vergebenes Like |
| First Link | erster Link auf ein anderes Topic **[fehlt: Topic-Verlinkung mit Rückverweisen]** |
| First Mention | erste @-Erwähnung (existiert: comments/server/utils/mentions.ts) |
| First Onebox | erste automatische Link-Vorschau **[fehlt: Onebox]** |
| First Quote | erstes Zitat in einer Antwort **[fehlt: Zitier-Funktion]** |
| First Reaction | erste Emoji-Reaktion **[fehlt: Reaktions-Picker, ≠ Like]** |
| First Reply By Email | erste Antwort per E-Mail **[fehlt: Mail-EINGANG — es gibt nur Versand]** |
| First Share | erster geteilter Link über den Share-Knopf |
| New User of the Month | 2 neue User je Monat, gemessen an erhaltenen Likes **[braucht Monats-Job]** |
| Read Guidelines | Guidelines gelesen **[fehlt: Lese-Tracking]** |
| Reader | langes Topic (100+ Antworten) vollständig gelesen **[fehlt: Lese-Tracking je Topic]** |
| Wiki Editor | ersten Wiki-Beitrag bearbeitet **[fehlt: Wiki]** |
| Licensed | Fortgeschrittenen-Tutorial abgeschlossen **[fehlt: Tutorial]** |

### Community

| Badge | Kriterium |
|---|---|
| Welcome | erstes erhaltenes Like |
| Appreciated | ≥1 Like auf 20 verschiedenen Beiträgen |
| Thank You | 20 gelikte Beiträge + ≥10 vergebene Likes |
| Gives Back | 100 gelikte + ≥100 vergebene |
| Empathetic | 500 gelikte + ≥1000 vergebene |
| Respected | ≥2 Likes auf 100 Beiträgen |
| Admired | ≥5 Likes auf 300 Beiträgen |
| Enthusiast / Aficionado / Devotee | 10 / 100 / 365 Tage in Folge besucht **[fehlt: Besuchs-Streaks]** |
| Anniversary | 1 Jahr Mitglied + ≥1 Beitrag in dem Jahr |
| Out of Love / Higher Love / Crazy in Love | alle 50 Tages-Likes an 1 / 5 / 20 Tagen verbraucht **[fehlt: Tages-Like-Limit]** |
| Promoter / Campaigner / Champion | 1 Einladung / 3 Eingeladene wurden Basic / 5 wurden Member **[fehlt: Einladungen DURCH MITGLIEDER — community_invites gehört Owner/Admin; Stufen brauchen Trust Levels]** |
| Nice/Good/Great Share | geteilter Link von 25 / 300 / 1000 externen Besuchern geklickt **[fehlt: Klick-Zählung]** |

### Posting

| Badge | Kriterium |
|---|---|
| Nice / Good / Great Reply | 10 / 25 / 50 Likes auf eine Antwort |
| Nice / Good / Great Topic | 10 / 25 / 50 Likes auf ein Topic |
| Popular / Hot / Famous Link | geposteter Link mit 50 / 300 / 1000 Klicks **[fehlt: Klick-Zählung]** |

### Trust Level

| Badge | Kriterium und verliehene Rechte |
|---|---|
| Basic (TL1) | Grundrechte: private Nachrichten **[fehlt: PN]**, Melden, Wiki **[fehlt]**, mehrere Bilder/Links je Beitrag |
| Member (TL2) | Einladungen, Gruppen-PNs **[fehlt: PN]**, mehr Tages-Likes |
| Regular (TL3) | umkategorisieren/umbenennen fremder Topics, stärkere Spam-Flags, noch mehr Likes |
| Leader (TL4, von Hand ernannt) | alle Beiträge editieren; pin/close/unlist/archive/split/merge **[fehlt: unlist, split, merge]** |

**Trust Levels sind kein Badge-Feature, sondern ein RECHTE-System** — sie
verleihen Fähigkeiten, die heute an Site-Rollen und Capabilities hängen
(requireCommunityPermission). Ein zweites, verhaltensbasiertes Rechtesystem
NEBEN dem RBAC ist die größte Architektur-Entscheidung dieses Katalogs und
braucht ein eigenes Ja von David — nicht als Nebenprodukt der Badges.

## 3.7 Was das am Schnitt ändert

Mit diesem Katalog ist Discussions im Vollausbau **kein „posts + zwei Zeilen"
mehr, sondern ein Forum der Discourse-Klasse** — die Teil-2-Messung gilt nur
noch für den Kern. Ehrliche Rechnung in Stufen (jede für sich lauffähig,
Weg B aus Teil 2 bleibt als Fundament richtig und wird durch den Katalog eher
BESTÄTIGT: nichts hier braucht ein eigenes Thread-Datenmodell, fast alles
braucht Zähl-, Lese- und Rechte-Infrastruktur OBENDRAUF):

1. **Kern (Tage):** Kategorien, Topics-Tabelle (ohne Views), Sortierung
   Hot/Latest/Top+Zeitraum/Categories, Seitenleiste, Basis-Filter,
   einfache Suche. = Teil 2, Stufen 1–4.
2. **Betrieb & Regelwerk (Tage):** Views-Zähler, Activity-Aggregation,
   About-Seite mit Statistiken, Guidelines/ToS/Privacy über die
   pages-Mechanik (+ die Rechtsfrage aus 3.5).
3. **Suche voll (Tage bis Woche):** erweiterte Filter; setzt die
   Topic-Zustände (open/closed/archived/pinned/solved) voraus, die hier
   erstmals entstehen.
4. **Badges (Woche+):** Katalog abzüglich der [fehlt:]-Einträge sofort
   baubar; jeder [fehlt:]-Eintrag ist ein eigenes kleines Feature davor.
   Braucht Ereignis-Zählung je User (Likes erhalten/vergeben, Streaks,
   Klicks) — eine neue, communityId-gebundene Infrastruktur.
5. **Trust Levels (eigenes Projekt):** siehe 3.6 — nur mit ausdrücklicher
   Architektur-Entscheidung.

## 3.8 Die sieben Entscheidungen — ALLE GEFALLEN (David, 2026-08-03)

Damit ist das Konzept **entscheidungskomplett**; offen ist nur noch der
Baustart (Feature-Stopp, siehe OPEN-ITEMS).

1. **Weg B** — Kategorie als Dimension von `posts`, Discussions als eigene
   Ansicht. Ein Datenmodell, eine Moderation; die Spalte wäre später der
   Migrationspfad, falls Discussions doch ein eigenes Wesen entwickelt.
2. **Kategorisierte Beiträge BLEIBEN im Feed.** Der Feed ist der Strom über
   alles, Discussions die strukturierte Sicht — eine Community hat EINEN Ort.
3. **Das Produkt heißt Discussions/Diskussionen**; der Kommentar-Baustein auf
   der Landing wird zu „Kommentare" umbenannt (reine Textänderung, gehört in
   Stufe 1).
4. **Like = Upvote.** Ein Signal, keine neue Tabelle, alle Badge-Kriterien
   sofort messbar. Downvotes bleiben (die Reddit-Hälfte des „Mitteldings")
   und sind badge-neutral.
5. **Trust Levels: später, nach Stufe 1–4** — als eigene
   Architektur-Entscheidung mit eigenem Entwurf. Die vier TL-Badges bleiben
   bis dahin ausgespart.
6. **Regelwerk: nur Guidelines jetzt** (pages-Mechanik, Beispieltext,
   Owner-editierbar). ToS/Privacy je Community erst nach der Rechtsklärung
   mit dem Anwalt — die steht mit A1 ohnehin an.
7. **Seitenleiste: meine letzten 5 Kategorien** (in denen ich gepostet oder
   kommentiert habe); ohne eigene Aktivität Rückfall auf die 5 größten. Plus
   „All categories".

---

# Teil 4 — Stufe-4-Entscheidungen (David, 2026-08-04)

**Zuschnitt Stufe 4: nur heute messbare Badges.** Alles, was an Upvotes,
eigenen Beiträgen, Mitgliedschaftsdauer und Profil hängt — Großteil von
„Getting started"/„Community", komplett „Posting" — plus die Ereignis-Zählung
je Nutzer als Fundament. Fehlende Badges kommen automatisch dazu, sobald ihre
Funktion existiert.

**Tracking-Bündel: NICHTS davon.** Lese-Fortschritt, Besuchs-Streaks und
Klick-Zählung geteilter Links verlangen personenbezogene Verhaltensprotokolle
und widersprechen dem Versprechen „Datenschutz-nativ, ohne Werbe-Tracking".
Kostet 9 Badges (Reader · Read Guidelines · Enthusiast/Aficionado/Devotee ·
Nice/Good/Great Share · Popular/Hot/Famous Link) — die entfallen DAUERHAFT,
nicht „später".

**Schreib-Werkzeuge — gebaut wird (alles über die Nuxt-UI-Editor-Bausteine,
nichts selbst gebaut):** Zitieren (UEditor Blockquote) · Emoji-Auswahl
(UEditorEmojiMenu) · Themen verlinken mit Rückverweis (UEditorSuggestionMenu).
**Onebox NICHT** — der Server holte fremde URLs ab (SSRF); wenn, dann als
eigenes Paket mit Sicherheitsentwurf.

**Soziale Mechaniken — alle vier gebaut**, in dieser Reihenfolge:
1. **Einladungen durch Mitglieder** (heute nur Owner/Admin) — der einzige
   echte Wachstumshebel, plattformweit nützlich. Braucht ein Kontingent gegen
   Missbrauch. Bringt Promoter/Campaigner/Champion.
2. **Tages-Limit für Likes** — klein; macht Likes knapp. Bringt Out of
   Love/Higher Love/Crazy in Love.
3. **Emoji-Reaktionen neben den Stimmen.** Ich hatte abgeraten (drittes Signal
   am selben Beitrag); Davids Entscheidung steht. **Folgeregel, damit die
   Bedeutung eindeutig bleibt:** Badges zählen weiter AUSSCHLIESSLICH Upvotes
   (Entscheidung 4 gilt unverändert), Reaktionen sind reiner Ausdruck und
   badge-neutral — sonst hätte „Like" zwei Quellen.
4. **Private Nachrichten** — eigenes Produkt mit eigener Missbrauchsfläche
   (Belästigung, Spam) und eigener Moderation. Bekommt ein EIGENES Konzept vor
   dem Bau, wie Discussions eines hat; nicht als Anhängsel von Stufe 4.

**Reihenfolge:** Stufe 4 = Badges (heute messbar). Danach die Werkzeuge, dann
die sozialen Mechaniken 1–3, dann PN mit eigenem Konzept. Trust Levels (Stufe
5) bleiben davon unberührt und brauchen weiterhin ihr eigenes Ja.

---

# Teil 5 — Baustand (Stand: Stufe 4)

Damit niemand denselben Weg zweimal geht: was steht, was bewusst NICHT steht,
und wo die Begründung dafür lebt. Offene Punkte gehören nicht hierher, sondern
nach `docs/OPEN-ITEMS.md`.

## Gebaut

- **Stufe 1** Kategorien, Topics-Tabelle, Sortierung, Seitenleiste, URL-Schema
  mit 301-Regel, Produkt-Gate.
- **Stufe 2** Aktivitäts-Vertrag (`lastActivityAt`), Aufruf-Zähler, About-Seite
  mit vier belegbaren Zahlen (die fünfte kam mit dem Jahrestag, s. u.),
  Guidelines über die pages-Mechanik.
- **Stufe 3** Topic-Zustände (angeheftet/geschlossen/gelöst) samt Schreibsperre,
  erweiterte Suche, redigierte Team-Sicht auf der About-Seite, „kommentiert"-
  Hälfte der Seitenleiste.
- **Stufe 4** Abzeichen: der Zähl-Vertrag in core
  (`registerUserCounterProvider`, sechster Cross-Layer-Vertrag), Quellen in
  posts/comments/moderation, Katalog + Verleihung (`user_badges`,
  posts-012), Galerie unter `/discussions/badges`.
- **Jahrestag + Beitritts-Zahl** (2026-08-04, Teil-5-Entscheidung 1) Beide
  fehlten aus demselben Grund und kommen deshalb über EINEN Weg: der
  Registry-Vertrag `registerCommunityJoinDatesResolver` (core, siebter
  Cross-Layer-Vertrag) mit zwei Fragen — „seit wann ist wer dabei?" und „wie
  viele kamen in N Tagen dazu?" —, beantwortet vom control-Layer über
  `community_members` (`$createdAt` der Zeile, nur Mitgliedschaften mit
  Zugang), verdrahtet in `apps/platform`. Das Abzeichen verlangt BEIDE Hälften
  des Katalogs (365 Tage dabei UND im letzten Jahr geschrieben); die zweite
  misst der bestehende Zähl-Vertrag über ein optionales `since`, damit auch
  Antworten mitzählen. KEINE Migration, keine neue Tabelle. Ohne Naht
  (apps/comments, Silo) bleibt das Abzeichen unverdient und die About-Kachel
  verschwindet — nie eine 0.
- **Kleines Paket** (2026-08-04) Regeln-Vorlage für Bestands-Communities als
  Laufzeit-Rückfall (Schalter `pukalani.pages.guidelinesFallback`, in
  `platform` an) und die Hilfe-Umbenennung „Diskussionen" → „Kommentare".
- **Kunden-Hilfe** (2026-08-04) eigene Seite
  `apps/help/content/anleitung/3.produkte/4.diskussionen.md` →
  `/anleitung/produkte/diskussionen`, plus je eine Zeile in der Produkt- und
  der Plan-Tabelle (Personal — Discussions sitzt auf dem Produkt-Key `posts`).
  Beschrieben ist AUSSCHLIESSLICH der Baustand oben; ein Abschnitt „Was es
  heute nicht gibt" nennt die Lücken beim Namen. Der 301, den die
  Hilfe-Umbenennung Stunden zuvor auf genau diesem Pfad hinterlassen hatte, ist
  entfernt — eine routeRule gewinnt gegen die Seite, beides ging nicht
  (Begründung im Kopf von `apps/help/nuxt.config.ts`).

## Was Stufe 4 an Abzeichen NICHT bringt — und warum

Der Katalog aus § 3.6 hat 40+ Einträge, gebaut sind 16. Die vollständige
Begründung steht im Kopf von `packages/posts/shared/badges.ts` — dort, wo sie
jemand liest, der ein Abzeichen nachreichen will. Kurzfassung:

- **Dauerhaft draußen** (Davids Entscheidung, Teil 4): die neun, die ein
  personenbezogenes Verhaltensprotokoll bräuchten.
- **Wartet auf seine Funktion**: Emoji, Zitat, Themen-Verlinkung, Reaktionen,
  Einladungen durch Mitglieder, Tages-Like-Limit — Reihenfolge in Teil 4.
- **Nicht baubar, obwohl es so aussieht**: „Editor" (`community_posts` hält
  keine Bearbeitung fest — `comments` hat `editedAt`, `posts` nicht).
  „Anniversary" stand hier bis zum 2026-08-04 daneben und ist jetzt GEBAUT
  (Teil-5-Entscheidung 1, siehe „Gebaut" oben).
- **Trust Levels** bleiben ausgespart (Entscheidung 5, eigenes Ja nötig).

Zwei Eigenschaften der Zählweise gehören dazu, weil sie später als Lücke
gelesen werden könnten: jedes Abzeichen wird GENAU EINMAL verliehen (gezählt
wird mit Aggregaten, „wie oft" verlangte die ganze Inhalts-Geschichte eines
Menschen), und ausgewertet wird beim HINSEHEN, nicht in einem Lauf — deshalb
gibt es zu Abzeichen auch keine Benachrichtigung.

## Teil 5 — Davids Entscheidungen nach Stufe 4 (2026-08-04)

Acht Entscheidungen, in zwei Runden gestellt. Sie legen die Reihenfolge für
alles nach Stufe 4 fest.

**In Stufe 4 hinein:**
1. **Anniversary kommt** — als eigenes Stück über die Dienst-Naht (Muster der
   Team-Route aus Stufe 3). Das Beitrittsdatum liegt in `community_members` im
   Control Plane; die naheliegenden Runtime-Quellen (`$createdAt` des Kontos,
   `user.joined`) beantworten eine ANDERE Frage. Schaltet zugleich die
   Beitritts-Statistik der About-Seite frei, die aus demselben Grund fehlt.

**Nächstes Paket (klein, behebt Sichtbares) — GEBAUT am 2026-08-04:**
2. **Verhaltensregeln-Vorlage** für Bestandskunden — jede Community bekommt
   einen bearbeitbaren Standardtext. Geworden ist es ein **Rückfall zur
   Laufzeit statt eines Backfills**: die `pages`-Zeilen liegen im
   Runtime-Projekt, die Liste der Communities im Control Plane, und ein
   Migrationslauf bekommt genau EINEN Schlüssel für EINE Instanz — er müsste
   den Bestand aus vorhandenen Zeilen erraten und verfehlte ausgerechnet die
   Communities ohne jede Seite. Fehlt die Zeile, liefern die Routen die
   Vorlage; das erste Speichern im Dashboard legt sie an. Eine vorhandene
   Zeile gewinnt immer, ein zurückgezogener Entwurf bleibt zurückgezogen.
   Begründung im Kopf von `packages/pages/shared/guidelinesFallback.ts`.
3. **Hilfe-Seiten umbenannt** — „Diskussionen" meinte dort noch die Kommentare.
   Produkt-Seite jetzt `/anleitung/produkte/kommentare` (301 für den alten
   Pfad); auf der Landing war dieselbe Umbenennung schon passiert.

**Erst mit den Werkzeugen, und dann GEMEINSAM — sie hängen alle an derselben
Umstellung (Zähler, die beim SCHREIBEN mitschreiben, statt beim Hinsehen zu
rechnen); getrennt gebaut wäre es dieselbe Arbeit zweimal:**
4. `posts.editedAt` nachziehen (comments hat es) — bringt „Editor" UND einen
   ehrlichen „bearbeitet"-Hinweis am Thema.
5. Abzeichen mehrfach verleihen + Benachrichtigung.
6. **Trust Levels** (die vier Stufen aus dem Katalog).

**Vor dem Bauen ein eigenes Konzept:**
7. **Private Nachrichten** — eigene Tabelle, Meldewege, Sperren, DSGVO-Export.
   Kein Anhängsel an Discussions: ein Nachrichtenweg ohne Meldeweg und Sperre
   ist ein Missbrauchskanal, den man hinterher nicht mehr zumacht.

**Dauerhaft entschieden:**
8. **Abzeichen bleiben auf Profil und Galerie** — NICHT neben dem Autorennamen
   in der Themenliste. Dort wäre es ein N+1 über 25 Autoren, also eine
   denormalisierte Spalte mit denselben Konsistenz-Schreibwegen wie „Hot".

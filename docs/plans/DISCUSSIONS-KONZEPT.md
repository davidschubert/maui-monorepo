# Discussions — Produkt-Konzept

**Teil 1** (2026-07-27) konserviert Davids Produkt-Entscheidungen. **Teil 2**
(2026-08-03, unten) ist der Schnitt-Entwurf: was davon heute noch trägt, wo die
Grenze zu `posts` wirklich verläuft, und welche drei Entscheidungen vor dem
ersten Commit fallen müssen.

Status: **entscheidungsreif, nicht in Bau.**

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

## Nicht verhandelbare Rahmenbedingungen (aus der Bilanz / Davids Prinzip)

- Konzept existiert EINMAL (eigener Layer), Komposition im site-Layer.
- Von Tag 1 durch die Datentür (`tenantDb`, tenantId, ESLint-Liste,
  Pool-Unique-Indizes mit tenantId) — kein Silo-Umweg wie bei events/courses.
- Produkt-Gate über `pukalani.tenancy.products` (Tarif-Zuordnung entscheidet David
  beim Baustart); An/Aus-Schalter im Dashboard als **USwitch** (nicht Checkbox).
- Nur Erscheinung ist mandanten-variabel (Theme/Schrift), Verhalten nie.

---

# Teil 2 — Schnitt-Entwurf (2026-08-03)

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

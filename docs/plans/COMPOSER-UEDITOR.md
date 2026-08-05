# PostComposer auf UEditor — gemessen, Blocker beseitigt, Umstellung GEBAUT

> **Stand 2026-08-04, dritter Anlauf: die Umstellung ist GEBAUT.** Die
> Schreibfläche (`packages/posts/app/components/PostBodyField.vue`) ist
> `UEditor` im Markdown-Modus; der Editor selbst liegt in `PostBodyEditor.vue`
> und wird NACHGELADEN (Produktions-Messung: 541 KiB roh / ~169 KiB gzip
> bleiben aus einer Feed-Ansicht ohne Schreibabsicht draußen, 20 % des
> JavaScripts). Beweis: `packages/posts/scripts/verify-composer-editor.mjs`
> (72/72, echter Browser, echte Route, echter Renderer). Was NICHT durchläuft
> und warum, steht dort im Kopf und in den Prüfungen: verschachtelte Listen
> rendert `parseMarkdown` flach, ein Sternchen-PAAR ist Betonung (auch in
> einer Rechnung — das war in der Textfläche schon so).
> **Seit 2026-08-05 ist auch die Namensvervollständigung (`UEditorMentionMenu`)
> gebaut** — siehe den Nachtrag am Ende dieses Dokuments. Dieses Dokument
> bleibt als MESSUNG stehen; alles unter „Optionen" ist Geschichte.
>
> Der Text unten beschreibt den Stand VOR der Umstellung:

**Stand: 2026-08-04. Die Umstellung ist NICHT gebaut — der BLOCKER schon
beseitigt.** Der Auftrag lautete, den `PostComposer` von `UTextarea` auf
`UEditor` im Markdown-Modus umzustellen. Die Messung fand einen Blocker, der
weder am Zuschnitt noch an der Konfiguration lag; Davids Entscheidung war
darauf **Option B** (unten), und die ist am selben Tag gebaut worden.

> **Was sich seit der Messung geändert hat (2026-08-04, Option B):**
> `packages/core/shared/markdown.ts` versteht jetzt Backslash-Escapes und
> HTML-Entities nach CommonMark. Der unten beschriebene Blast-Radius ist damit
> **erledigt**: gespeichertes `snake\_case` wird als `snake_case` gelesen,
> `&lt;` als `<`. Die Bestandsdaten waren vorher gegen beide
> Produktions-Instanzen gezählt — 0 von 80 Texten betroffen. Zwei der
> Nebenbefunde sind ebenfalls erledigt (siehe unten). **Offen bleibt genau
> die Umstellung selbst**, plus die Rest-Unschärfen `HorizontalRule` und
> Bündelgewicht. Details: `docs/OPEN-ITEMS-COMPLETE.md`, Eintrag „F48
> Teilpaket 1".

## Die Annahme, die nicht hält

Der Auftrag ging — richtig — davon aus, dass `community_posts.body` ein
Markdown-SUBSET ist (`packages/core/shared/markdown.ts`, eigener sicherer
Parser, kein `v-html`) und dass `UEditor` im Markdown-Modus deshalb
WORTGLEICH speichern würde: keine Migration, Bestandsdaten bleiben gültig.

Das gilt für **Formatierung**. Es gilt nicht für **gewöhnlichen Fließtext**.

## Was gemessen wurde

`@tiptap/markdown` serialisiert jeden Text-Knoten durch zwei fest verdrahtete
Schritte (`MarkdownManager.encodeTextForMarkdown`, Zeile 1062 in
`dist/index.js` der Version 3.27.1):

```js
return this.escapeMarkdownSyntax(encodeHtmlEntities(text))
// escapeMarkdownSyntax: text.replace(/([\\`*_[\]~])/g, '\\$1')
```

Beides ist **hartkodiert**: keine Option, kein Extension-Hook. Der Text-Zweig
in `renderNodeToMarkdown` greift, BEVOR irgendein Extension-Handler gefragt
wird — eine eigene Extension kann es also nicht überschreiben.

Betroffene Zeichen: ``\ ` * _ [ ] ~`` werden mit Backslash maskiert,
zusätzlich werden `<`, `>`, `&` zu `&lt;`, `&gt;`, `&amp;`.

**Unser Parser kennt weder Backslash-Escapes noch HTML-Entities.** Beides
reicht er unverändert als Text durch — der Leser sieht die Backslashes.

### Live gemessen (echter Browser, echter `UEditor`)

Wegwerf-Seite in `apps/comments`, `content-type="markdown"`, danach gelöscht:

| Schritt | Inhalt |
| --- | --- |
| getippt | `Wir nutzen snake_case und 2 * 3 und [Name] und a < b` |
| im Editor sichtbar | dasselbe (korrekt) |
| **Modell = was gespeichert würde** | `Wir nutzen snake\_case und 2 \* 3 und \[Name\] und a &lt; b` |
| durch `parseMarkdown` gerendert | **unverändert** — Backslashes und `&lt;` stehen sichtbar im Beitrag |

Ein DOM-freier Nachbau über `MarkdownManager.parse/serialize` liefert Zeichen
für Zeichen dasselbe; die Messung hängt also nicht am Browser.

### Blast-Radius an Alltagssätzen

**9 von 15** ganz gewöhnlichen Sätzen werden beim Speichern verändert:

| getippt | gespeichert |
| --- | --- |
| `Wir nutzen snake_case im Code.` | `Wir nutzen snake\_case im Code.` |
| `Die Datei heisst user_profile_2.png` | `Die Datei heisst user\_profile\_2.png` |
| `Rechnung: 2 * 3 * 4 = 24` | `Rechnung: 2 \* 3 \* 4 = 24` |
| `Platzhalter [Name] bitte ersetzen` | `Platzhalter \[Name\] bitte ersetzen` |
| `Pfad C:\Users\test` | `Pfad C:\\Users\\test` |
| `Vergleich a < b > c` | `Vergleich a &lt; b &gt; c` |
| `Prozent 50% und ~ungefaehr` | `Prozent 50% und \~ungefaehr` |
| `Mail an a+b@example.com` | `Mail an [a+b@example.com](mailto:a+b@example.com)` |

Das ist **kein** Fall für `bodyToSave` aus `packages/core/shared/editorBody.ts`
(bis zur Umstellung lag die Regel in `packages/pages`).
Jene Regel („Öffnen darf nichts ändern") schützt einen Text, den NIEMAND
angefasst hat. Hier tippt der Mensch, und genau das Getippte wird verfälscht.

### Was am Subset sauber durchläuft

Damit der nächste Anlauf weiß, dass nur das eine Ding klemmt — alles
Folgende ist byte-stabil durch `parse → serialize`: `**fett**`, `*kursiv*`,
`` `code` ``, `[Text](https://…)` und interne `/`-Pfade, `##`/`###`,
`-`- und `1.`-Listen (auch verschachtelt), `>` Zitate, ```` ``` ````-Blöcke,
Absätze und Zeilenumbrüche. Abgeschaltet wirken zuverlässig
`strike: false`, `underline: false`, `heading: { levels: [2, 3] }`,
`:image="false"`, `:mention="false"`; Tabellen und Aufgabenlisten sind gar
nicht erst im Schema.

Eine Rest-Unschärfe bleibt so oder so: `HorizontalRule` hängt `UEditor`
unbedingt an, solange `starter-kit` nicht komplett `false` ist. Sie wäre
harmlos — `---` landet als sichtbarer Text im Beitrag, so wie heute auch.

## Erwähnungen — David hatte recht, es war eine Mess-Frage

Gemessen mit einem echten Mention-Knoten im echten Editor:

```
Hallo [@ id="u1" label="Anna Beispiel"] willkommen
```

Das ist Davids **Fall 3**: weder reiner Text `@name` noch ein Markdown-Link,
sondern eine eigene Klammer-Syntax. Unser Parser findet dahinter kein
`(url)`, macht also keinen Link daraus und reicht die Zeichenkette roh durch —
der Leser sähe wörtlich `[@ id="u1" label="Anna Beispiel"]`.
**Also nicht einbauen.**

Ein späteres Erwähnungs-Paket bräuchte ohnehin mehr als die Optik: eine
Nutzer-**Id** (nicht nur den Anzeigenamen), einen eigenen Zweig in
`messageKey()` samt Texten in de+en (sonst fällt die Meldung still auf
`'replied'` zurück, siehe C17) und ein Ziel für den Link — öffentliche
Profilseiten gibt es noch nicht.

### NACHTRAG 2026-08-04: gebaut — und der Knoten wird gar nicht gebraucht

Das Erwähnungs-Paket ist da (Handles je Community, Auflösung, Hervorhebung,
Benachrichtigung). Zwei Dinge daraus gehören hierher, weil sie die Messung
oben korrigieren:

**1. Der Blocker ist LÖSBAR, gemessen.** Die Maskierung sitzt ausschließlich
im Zweig `node.type === 'text'` von `renderNodeToMarkdown`. Jeder ANDERE
Knoten geht durch `handler.renderMarkdown(node, …)`, und dessen Rückgabe wird
**wörtlich** übernommen — auch in `renderNodesWithMarkBoundaries` (dort im
`else`-Zweig). Ein eigener Serialisierer für den Mention-Knoten ist also
möglich, und er hat keine Nebenwirkung auf Text:

| Aufbau | serialisiert zu |
| --- | --- |
| `Mention` unverändert | `Hallo [@ id="davidschubert" label="David Schubert"] willkommen` |
| `Mention.extend({ renderMarkdown: n => '@' + n.attrs.id })` | `Hallo @davidschubert willkommen` |
| derselbe Text ohne Knoten, `serialize(parse(x))` | `Hallo @davidschubert willkommen` (stabil) |

**2. Der Knoten wird für das PRODUKT nicht gebraucht.** Eine Erwähnung ist in
diesem Produkt gewöhnlicher Text: `@` steht in KEINER der beiden hartkodierten
Listen (maskiert werden ``\ ` * _ [ ] ~``, kodiert `< > &`). Getipptes
`@handle` überlebt den Rundlauf zeichengleich, und Auflösung, Hervorhebung und
Benachrichtigung hängen am Text, nicht am Knoten — bewiesen in
`packages/posts/scripts/verify-handles-mentions.mjs` (34/34, echter Browser).

### NACHTRAG 2026-08-05: `UEditorMentionMenu` ist GEBAUT

Der letzte offene Rest ist erledigt — und die Diagnose des abgebrochenen
Versuchs war nur zur Hälfte richtig. Sie lautete: die Abhängigkeit bewegt den
Lockfile um 1898 Zeilen (+334/−1564), das rechtfertigt eine hinzugefügte
Abhängigkeit nicht. Der Abbruch war korrekt, die URSACHE aber nicht die
Abhängigkeit, sondern ihre UNGEPINNTE Aufnahme: `@tiptap/extension-mention`
liegt als optionaler Peer von `@nuxt/ui` längst im Baum. Mit einem
Katalog-Eintrag **exakt `3.27.1`, ohne Caret**, greift pnpm denselben
Store-Eintrag — nachgeprüft an der identischen Inode.

**Gemessen: +6 Lockfile-Zeilen (+6/−0)** statt 1898.

Eine Caret-Range wäre hier nicht Schlamperei, sondern der Defekt selbst:
`^3.27.1` erlaubt 3.28, `@nuxt/ui` bliebe bei 3.27.1, und zwei Kopien von
`@tiptap/core` heißen, dass Tiptap die eigene Extension nicht mehr erkennt —
die Klammer-Syntax käme still in die Beiträge zurück. Darum steht
`@tiptap/core` jetzt in `scripts/check-single-copy.mjs`.

Gebaut ist genau das, was oben als lösbar beschrieben war: `:mention="false"`
plus `Mention.extend({ renderMarkdown })` über `:extensions`, dazu das Menü
mit `ignore-filter` gegen `GET /api/handles/search`. Beweis:
`packages/posts/scripts/verify-mention-menu.mjs` — **22/22**, echter Browser,
echte Route, echte Glocke; die Gegenprobe (Serialisierer entfernt) fällt auf
14/22, der Beweis kann also wirklich scheitern.

**Bündelgewicht, Produktions-Build gegen Produktions-Build:** der kritische
Pfad der Feed-Ansicht ist **byte-gleich** (1 060 198 roh, 123 Dateien, beide
Seiten; gzip 355 966 → 355 959). Die Erwähnungs-Logik landet in einem eigenen,
nachgeladenen Chunk (19 818 roh / 6 475 gzip); über ALLE Chunks summiert
kostet das Paket 4 361 Bytes roh. Der ProseMirror-Chunk selbst wächst um
8 Bytes — das Extension-Modul lag ohnehin schon drin, weil `@nuxt/ui` es
mitliefert.

**Eine Falle für den nächsten Messenden:** die Feed-Seite lädt den
Tiptap-Chunk auch OHNE Schreibabsicht — aber als `rel="prefetch"`, nicht im
kritischen Pfad. Wer nur „welche .js-Dateien holt der Browser" zählt, hält das
Nachladen deshalb fälschlich für wirkungslos. Verglichen gehört der
KRITISCHE Pfad (`modulepreload` + `<script src>`), und der enthält den Editor
in keiner der beiden Fassungen.

Eine Sache aus der Liste oben ist übrigens ANDERS ausgegangen als vermutet:
der Link. Öffentliche Profilseiten gibt es weiterhin nicht — deshalb ist eine
Erwähnung **kein Link**, sondern nur hervorgehoben. Ein Link ins Leere wäre
schlechter als keiner.

## Optionen

**A — Anhalten, `UTextarea` behalten** *(Empfehlung für jetzt)*
Kosten: null. Der Composer bleibt, was er ist. Der Preis ist, dass die
Editor-Vorgabe vom 2026-08-04 an dieser einen Stelle nicht greift — mit
gemessener Begründung statt mit Schweigen.

**B — Den Renderer CommonMark-treu machen** *(GEWÄHLT und am 2026-08-04 gebaut)*
Der Blocker sitzt nicht im Editor, sondern darin, dass `parseMarkdown`
Backslash-Escapes und HTML-Entities nicht kennt. Das ist heute schon eine
Lücke: ein Bestandstext mit `\_` zeigt den Backslash. Wird sie geschlossen,
ist die Composer-Umstellung danach beinahe trivial.
**Keine Sicherheits-Lockerung** — `MarkdownContent` rendert über `h()`-vnodes,
Vue escaped jeden Text, es gibt weiterhin keinen `v-html`-Pfad.
**Aber:** es ändert die Anzeige aller Bestandsinhalte, die zufällig einen
Backslash vor ``\ ` * _ [ ] ~`` oder eine `&…;`-Folge tragen. Vor dem Bau
gehört gezählt, wie viele Zeilen das in `community_posts` und `comments`
wirklich sind. Eigenes Paket, eigener Beweis.

**C — Eine eigene Ent-Maskierung hinter den Editor hängen** *(nicht empfohlen)*
Technisch die Umkehrfunktion des oben zitierten Zweizeilers. Zwei Haken:
innerhalb von Code-Spans maskiert der Serialisierer NICHT, eine
dokumentweite Umkehr würde dort echte Backslashes fressen — korrekt ginge es
nur mit einem zweiten Markdown-Tokenizer. Und die Zeichenliste ist eine
fremde, hartkodierte Konstante: nimmt `@tiptap/markdown` bei einem Bump ein
Zeichen dazu, ist die Umkehr still unvollständig und die Verfälschung kommt
wortlos zurück.

## Nebenbefunde für den nächsten Anlauf

- **Bündelgewicht** wurde bewusst NICHT mehr gemessen, nachdem der Blocker
  feststand. Wichtig bleibt: `PostFeed.vue:114` mountet den Composer eifrig
  (`v-if="isLoggedIn"`, kein Lazy) — Tiptap käme damit in das Bündel jeder
  eingeloggten Feed-Ansicht. Vorbild für später ist K4:
  `<LazyThemePickerModal v-if="pickerMounted">` in
  `packages/themes/app/components/DisplaySettingsMenu.global.vue:111`.
- ~~**Die Bearbeiten-Fläche ist eine andere Komponente**~~ — **erledigt
  2026-08-04:** beide benutzen jetzt `PostBodyField` (weiterhin `UTextarea`).
  Die Umstellung trifft damit EINE Datei.
- `MAX_POST_BODY = 10_000` ist die GRÖSSE DER SPALTE (`varchar(10000)`), und
  daran ändert sich nichts. Gezählt werden seit dem 2026-08-04 Codepoints
  statt UTF-16-Einheiten (`packages/posts/shared/postBody.ts`) — das war ein
  eigener Fehler und ist behoben. **Nicht behoben und für dieses Paket
  wichtig:** Markdown aus dem Editor ist länger als der getippte Text. Wer
  10 000 GETIPPTE Zeichen zusagen will, braucht eine größere Spalte (Muster
  pages-002, MEDIUMTEXT) — Migration und eigene Entscheidung.
- Tiptap liegt als **auto-installierter optionaler Peer** von `@nuxt/ui` im
  Baum (3.27.1, genau eine Kopie). Wer eigene `@tiptap/*`-Abhängigkeiten
  aufnimmt, muss sie exakt darauf festnageln und `@tiptap/core` in
  `scripts/check-single-copy.mjs` eintragen — sonst stehen zwei Kopien im
  Baum und Extensions werden nicht mehr erkannt.

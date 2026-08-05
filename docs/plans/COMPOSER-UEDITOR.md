# PostComposer auf UEditor — gemessen, angehalten

**Stand: 2026-08-04. NICHT gebaut.** Der Auftrag lautete, den `PostComposer`
von `UTextarea` auf `UEditor` im Markdown-Modus umzustellen. Die Messung hat
einen Blocker gefunden, der weder am Zuschnitt noch an der Konfiguration
liegt. Dieses Dokument hält fest, was gemessen wurde, damit die nächste
Sitzung es nicht noch einmal herleiten muss.

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

Das ist **kein** Fall für `bodyToSave` aus `packages/pages/shared/editorBody.ts`.
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

## Optionen

**A — Anhalten, `UTextarea` behalten** *(Empfehlung für jetzt)*
Kosten: null. Der Composer bleibt, was er ist. Der Preis ist, dass die
Editor-Vorgabe vom 2026-08-04 an dieser einen Stelle nicht greift — mit
gemessener Begründung statt mit Schweigen.

**B — Den Renderer CommonMark-treu machen** *(der eigentliche Weg zum Ziel)*
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
- **Die Bearbeiten-Fläche ist eine andere Komponente:** `PostCard.vue:185`
  ist eine blanke `UTextarea`. Wer den Composer umstellt und sie vergisst,
  hat zwei Schreibflächen mit zwei Formaten.
- `MAX_POST_BODY = 10_000` misst die SERIALISIERTE Zeichenkette — Markdown
  aus dem Editor ist länger als der getippte Text.
- Tiptap liegt als **auto-installierter optionaler Peer** von `@nuxt/ui` im
  Baum (3.27.1, genau eine Kopie). Wer eigene `@tiptap/*`-Abhängigkeiten
  aufnimmt, muss sie exakt darauf festnageln und `@tiptap/core` in
  `scripts/check-single-copy.mjs` eintragen — sonst stehen zwei Kopien im
  Baum und Extensions werden nicht mehr erkannt.

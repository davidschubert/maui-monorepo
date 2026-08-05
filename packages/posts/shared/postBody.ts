/**
 * Wie lang ist ein Beitragstext?
 *
 * `MAX_POST_BODY` und `MAX_POST_TITLE` sind die GRÖSSEN DER SPALTEN
 * (`community_posts.body` = varchar(10000), `.title` = varchar(200), Migration
 * posts-001). Die Grenze bleibt, was sie ist — was sich am 2026-08-04 ändert,
 * ist WIE gezählt wird.
 *
 * Bis dahin zählte `z.string().max()` UTF-16-EINHEITEN. Appwrite (und darunter
 * MariaDB) zählt CODEPOINTS. Für lateinischen Text ist das dasselbe, für alles
 * jenseits der BMP nicht: ein Emoji ist EIN Codepoint und ZWEI UTF-16-Einheiten.
 * Ein Beitrag aus 6000 Emoji wurde also abgelehnt („12000 Zeichen"), obwohl die
 * Spalte ihn anstandslos genommen hätte — die Grenze maß nicht, was der Mensch
 * geschrieben hat, sondern wie sein Text im Speicher liegt.
 *
 * Am 2026-08-04 gegen die lokale Appwrite 1.9.6 nachgemessen (Wegwerf-Tabelle,
 * varchar(10000)):
 *
 * | Wert                 | Codepoints | UTF-16 | Appwrite |
 * | -------------------- | ---------- | ------ | -------- |
 * | 10000 × `a`          | 10000      | 10000  | nimmt an |
 * | 10001 × `a`          | 10001      | 10001  | lehnt ab |
 * | 6000 × Emoji         | 6000       | 12000  | nimmt an |
 * | 10000 × Emoji        | 10000      | 20000  | nimmt an |
 * | 10001 × Emoji        | 10001      | 20002  | lehnt ab |
 *
 * Damit gilt in BEIDE Richtungen, was gelten muss: abgelehnt wird nichts, was
 * die Spalte noch aufnähme, und durch kommt nichts, was sie sprengt.
 *
 * NICHT DASSELBE wie „was der Mensch getippt hat", sobald ein Editor
 * serialisiert: `@tiptap/markdown` macht aus getipptem `snake_case` ein
 * gespeichertes `snake\_case`. Diese Lücke bleibt offen und lässt sich hier
 * auch nicht schließen — die Spalte fasst nun einmal 10000 Zeichen. Wer beim
 * Composer-Umbau (docs/plans/COMPOSER-UEDITOR.md) 10000 GETIPPTE Zeichen
 * zusagen will, braucht eine größere Spalte (Muster: pages-002, MEDIUMTEXT),
 * und das ist eine Migration und eine eigene Entscheidung.
 */
export function textLength(value: string): number {
  // Der Spread iteriert Codepoints, `.length` zählt UTF-16-Einheiten.
  return [...value].length
}

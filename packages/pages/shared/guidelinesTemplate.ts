/**
 * Die Community-Regeln als START-TEXT einer frisch angelegten Community
 * (F1 Stufe 2, Davids Entscheidung 6: NUR Guidelines — ToS und Privacy je
 * Community erst nach der Rechtsklärung).
 *
 * ── DREI UNTERSCHIEDE ZU `legalTemplates.ts`, jeder mit Grund ──────────────
 *
 * 1. **VERÖFFENTLICHT, nicht Entwurf.** Bei Impressum und Datenschutz ist der
 *    Entwurf zwingend: ein Rechtstext voller Platzhalter darf nie öffentlich
 *    stehen. Hier ist es umgekehrt — Regeln, die niemand sehen kann, sind keine
 *    Regeln, und der Navigationspunkt zeigte ins Leere. Der Text unten
 *    funktioniert deshalb unverändert.
 *
 * 2. **KEINE PLATZHALTER.** Aus demselben Grund: `[AUSFÜLLEN: …]` auf einer
 *    veröffentlichten Seite ist eine kaputte Seite. Alles, was hier steht, gilt
 *    für jede Community dieses Produkts — auch der Hinweis aufs Melden, denn
 *    den Melde-Weg gibt es überall (registerReportTarget). Wo eine Community
 *    eigene Regeln braucht, schreibt der Owner sie darüber; die Seite ist ab
 *    dem ersten Tag seine.
 *
 * 3. **KEINE RECHTSAUSSAGE.** Der Text sagt, wie man hier miteinander umgeht.
 *    Er sagt NICHTS über Haftung, Vertragsbedingungen oder Datenverarbeitung —
 *    genau das ist die Grenze, die Entscheidung 6 zieht, und deshalb steht hier
 *    auch kein Satz, der wie ein Nutzungsvertrag klingt.
 *
 * EIGENER TEXT. Das Vorbild des Konzepts ist Discourse, dessen Standard-
 * Guidelines sind aber fremdes Produkt-Material — übernommen wird die IDEE
 * einer Verhaltensregel-Seite, nicht die Formulierung.
 *
 * Fast reines Daten-Modul: der einzige Import ist die Adresse der Seite, und
 * die wohnt bewusst in `types/page.ts` — der Navigationspunkt im
 * blueprint-Layer braucht sie, und ein Wert-Import aus DIESER Datei zöge beide
 * Sprachfassungen des Textes in jedes Client-Bundle. Seed-Helfer und jedes
 * künftige Nachrüst-Skript teilen sich trotzdem EINE Quelle für den Inhalt.
 *
 * Markdown-Subset wie bei den Rechtsvorlagen: nur was core/shared/markdown.ts
 * parst — `##`, Absätze, Listen, `**fett**`. Keine Links, keine Tabellen.
 */
import { GUIDELINES_SLUG } from './types/page'

/**
 * Position in der Seiten-Navigation. Vor den Rechtsseiten (90/91), hinter allem
 * Inhaltlichen — die Regeln sind kein Rechtstext, aber auch keine Startseite.
 */
export const GUIDELINES_SORT_ORDER = 80

export interface GuidelinesTemplate {
  slug: typeof GUIDELINES_SLUG
  sortOrder: number
  title: string
  body: string
}

const BODY_DE = `Diese Seite beschreibt, wie wir hier miteinander umgehen. Sie ist kurz
gehalten, weil die meisten Menschen ohnehin wissen, was gemeint ist — und weil
lange Regelwerke niemand liest.

## Der eine Satz

Schreib so, dass die anderen gern antworten.

## Bevor du etwas schreibst

- **Sieh kurz nach, ob es das Thema schon gibt.** Eine Antwort im laufenden
  Gespräch ist mehr wert als ein zweites Thema daneben.
- **Wähl die Kategorie, in die es gehört.** Sie ist die Ordnung, nach der die
  anderen suchen.
- **Gib deinem Thema einen Titel, der es verrät.** „Frage" sagt nichts;
  „Warum bricht der Export bei großen Dateien ab?" sagt alles.

## Beim Antworten

- **Antworte auf das, was dasteht** — nicht auf das, was du vermutest.
- **Widersprich der Sache, nicht der Person.** Eine falsche Annahme darf man
  deutlich korrigieren. Wer sie hatte, bleibt trotzdem willkommen.
- **Wenn du nichts hinzuzufügen hast, musst du nichts schreiben.** Zustimmung
  zeigt hier die Stimme, nicht ein zusätzlicher Beitrag.
- **Nimm den freundlichsten Sinn an, den ein Satz haben kann.** Im Netz fehlen
  Stimme und Gesicht; das meiste, was schroff wirkt, war nur knapp.

## Was hier nicht hingehört

- Beleidigungen, Herabwürdigung und Angriffe auf Personen oder Gruppen
- Werbung und wiederholte Eigenwerbung ohne Bezug zum Thema
- Inhalte, die gegen geltendes Recht verstoßen
- persönliche Daten anderer Menschen — Adressen, Telefonnummern, private
  Nachrichten, Bilder ohne Einverständnis
- fremde Texte und Bilder, für die dir die Rechte fehlen

## Wenn dir etwas auffällt

Melde den Beitrag, statt selbst zu schlichten. Eine Meldung geht an die
Moderation, nicht an den Verfasser, und eine öffentliche Zurechtweisung macht
aus einem Ärgernis meistens zwei.

## Was passiert, wenn sich jemand nicht daran hält

Die Moderation kann Beiträge ausblenden und im Wiederholungsfall den Zugang zu
dieser Community entziehen. Der Regelfall ist aber ein Hinweis — die Absicht
ist, das Gespräch zu erhalten, nicht Leute loszuwerden.

## Diese Seite darf sich ändern

Wenn eine Regel fehlt oder eine hier stört, sag Bescheid. Regeln sind hier
dazu da, das Miteinander leichter zu machen; wo sie das nicht tun, gehören
sie geändert.`

const BODY_EN = `This page describes how we treat each other here. It is short on purpose —
most people already know what is meant, and nobody reads a long rulebook.

## The one sentence

Write in a way that makes others want to answer.

## Before you post

- **Check whether the topic already exists.** A reply in an ongoing
  conversation is worth more than a second thread beside it.
- **Pick the category it belongs to.** That is the order everyone else
  searches by.
- **Give your topic a title that gives it away.** "Question" says nothing;
  "Why does the export stop on large files?" says everything.

## When you reply

- **Answer what is written** — not what you assume.
- **Argue with the point, not the person.** A wrong assumption may be
  corrected plainly. Whoever held it is still welcome here.
- **If you have nothing to add, you need not write.** Agreement is what the
  vote is for, not an extra post.
- **Assume the kindest reading a sentence can carry.** Online there is no
  voice and no face; most of what reads as curt was merely brief.

## What does not belong here

- insults, contempt, and attacks on people or groups
- advertising and repeated self-promotion unrelated to the topic
- anything that breaks the law
- other people's personal data — addresses, phone numbers, private messages,
  pictures without consent
- text and images you do not hold the rights to

## If something catches your eye

Report the post instead of settling it yourself. A report goes to the
moderators, not to the author, and a public telling-off usually turns one
annoyance into two.

## What happens if someone ignores this

Moderators can hide posts and, if it keeps happening, withdraw access to this
community. The normal case, though, is a quiet word — the point is to keep the
conversation, not to get rid of people.

## This page may change

If a rule is missing, or one of these gets in the way, say so. Rules exist here
to make things easier; where they do not, they belong changed.`

const TEMPLATES: Record<'de' | 'en', GuidelinesTemplate> = {
  de: { slug: GUIDELINES_SLUG, sortOrder: GUIDELINES_SORT_ORDER, title: 'Regeln', body: BODY_DE },
  en: { slug: GUIDELINES_SLUG, sortOrder: GUIDELINES_SORT_ORDER, title: 'Guidelines', body: BODY_EN },
}

/** 'de', 'de-AT' … → de; alles andere → en (bewusster Fallback, nie leer). */
export function guidelinesTemplateLocale(locale: string | null | undefined): 'de' | 'en' {
  return String(locale ?? '').toLowerCase().startsWith('de') ? 'de' : 'en'
}

/** Die Vorlage in der passenden Sprache. */
export function guidelinesTemplate(locale: string | null | undefined): GuidelinesTemplate {
  return TEMPLATES[guidelinesTemplateLocale(locale)]
}

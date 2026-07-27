/**
 * Vorlagen für die zwei Rechtsseiten einer Community (Audit-Befund S7, Teil 1).
 *
 * WARUM es Vorlagen sind und keine Texte: der KUNDE ist Betreiber seiner
 * Community und damit der Verantwortliche im Sinne der DSGVO — Impressum und
 * Datenschutzerklärung sind SEINE Angaben, nicht unsere. Wir können ihm die
 * Struktur und die Fragen liefern, nicht die Antworten. Deshalb:
 *
 *  - jede Vorlage startet mit einem Hinweis, dass sie keine Rechtsberatung ist,
 *  - jede offene Stelle trägt einen unübersehbaren Marker (`[AUSFÜLLEN: …]` /
 *    `[FILL IN: …]`) — man kann den Text nicht versehentlich für fertig halten,
 *  - die Rows entstehen als ENTWURF (`status: 'draft'`), nie veröffentlicht:
 *    ein leerer Rechtstext live ist schlimmer als keiner,
 *  - über Pukalani/Hetzner steht nur, was der Kunde in seinem Vertrag
 *    nachlesen kann — als Platzhalter zum Bestätigen, KEINE Zusicherung
 *    (die Liste der Auftragsverarbeiter ist Sache des Plattform-Vertrags).
 *
 * Reines Daten-Modul (keine Imports, kein Laufzeit-Coupling): der Seed-Helfer
 * im Server und das Nachrüst-Skript im Control Plane teilen sich EINE Quelle,
 * damit Bestand und Neuanlage nie auseinanderlaufen.
 *
 * Markdown-Subset: nur was core/shared/markdown.ts parst — `##`/`###`,
 * Absätze, Listen, `>`-Zitat, `**fett**`. Keine horizontalen Linien, keine
 * Tabellen, keine Links in Platzhaltern (sonst wird der Marker ein Link).
 */

export const LEGAL_TEMPLATE_SLUGS = ['imprint', 'privacy'] as const
export type LegalTemplateSlug = (typeof LEGAL_TEMPLATE_SLUGS)[number]

/** Sprachen, für die es eine Vorlage gibt. Alles andere bekommt die englische. */
export const LEGAL_TEMPLATE_LOCALES = ['de', 'en'] as const

/** Marker je Sprache — auch der Beweis in Tests/Skripten prüft auf diesen String. */
export const LEGAL_TEMPLATE_MARKERS = { de: '[AUSFÜLLEN:', en: '[FILL IN:' } as const

export interface LegalTemplate {
  slug: LegalTemplateSlug
  /** Position in der Seiten-Navigation — Rechtsseiten stehen hinten. */
  sortOrder: number
  title: string
  /** Markdown-Body mit Platzhalter-Markern. */
  body: string
}

const IMPRINT_DE = `> **Vorlage — ersetzt keine Rechtsberatung.** Diese Seite ist ein Entwurf und
> noch nicht veröffentlicht. Ersetze die markierten Stellen durch deine Angaben,
> prüfe das Ergebnis (im Zweifel anwaltlich) und veröffentliche es erst dann.

## Anbieter

[AUSFÜLLEN: Name der Person, des Vereins oder des Unternehmens]
[AUSFÜLLEN: Straße und Hausnummer]
[AUSFÜLLEN: Postleitzahl und Ort]
[AUSFÜLLEN: Land]

## Kontakt

E-Mail: [AUSFÜLLEN: E-Mail-Adresse, unter der du erreichbar bist]
Telefon: [AUSFÜLLEN: Telefonnummer — oder diese Zeile löschen; verlangt ist eine schnelle elektronische Kontaktmöglichkeit]

## Vertreten durch

[AUSFÜLLEN: bei Verein, GmbH, UG usw. die vertretungsberechtigten Personen — als Einzelperson kannst du diesen Abschnitt löschen]

## Register und Umsatzsteuer

Register: [AUSFÜLLEN: Registergericht und Registernummer — nur falls eingetragen, sonst Abschnitt löschen]
Umsatzsteuer-Identifikationsnummer: [AUSFÜLLEN: USt-IdNr. — nur falls vorhanden]

## Verantwortlich für den Inhalt

[AUSFÜLLEN: Name und Adresse der inhaltlich verantwortlichen Person — nötig bei journalistisch-redaktionellen Angeboten, § 18 Abs. 2 MStV]

## Verbraucherstreitbeilegung

[AUSFÜLLEN: Angabe, ob du an einem Streitbeilegungsverfahren teilnimmst — relevant vor allem, wenn du über die Community etwas verkaufst; sonst Abschnitt löschen]

## Woran sich diese Struktur orientiert

Die Abschnitte folgen den Angaben nach § 5 Digitale-Dienste-Gesetz (DDG). Welche
davon du wirklich brauchst, hängt von Rechtsform und Angebot ab — die Vorlage ist
ein Rahmen, keine Prüfung deines Falls.`

const IMPRINT_EN = `> **Template — this is not legal advice.** This page is a draft and not
> published yet. Replace the marked parts with your own details, review the
> result (get legal advice if in doubt), and only then publish it.

## Provider

[FILL IN: name of the person, association or company]
[FILL IN: street and number]
[FILL IN: postcode and city]
[FILL IN: country]

## Contact

Email: [FILL IN: email address where you can be reached]
Phone: [FILL IN: phone number — or delete this line; what is required is a fast electronic way to reach you]

## Represented by

[FILL IN: for an association or company, the people authorised to represent it — as an individual you can delete this section]

## Register and VAT

Register: [FILL IN: register court and number — only if registered, otherwise delete this section]
VAT identification number: [FILL IN: VAT ID — only if you have one]

## Responsible for the content

[FILL IN: name and address of the person responsible for editorial content — required for journalistic/editorial offerings under German law, § 18 (2) MStV]

## Consumer dispute resolution

[FILL IN: whether you take part in a consumer dispute resolution scheme — mostly relevant if you sell something through this community; otherwise delete this section]

## What this structure follows

The sections follow the provider information required by § 5 of the German
Digital Services Act (DDG). Which of them you actually need depends on your
legal form and what you offer — this template is a frame, not a review of your
specific case.`

const PRIVACY_DE = `> **Vorlage — ersetzt keine Rechtsberatung.** Diese Seite ist ein Entwurf und
> noch nicht veröffentlicht. Trage deine Angaben ein, streiche was nicht
> zutrifft, prüfe das Ergebnis (im Zweifel anwaltlich) und veröffentliche es
> erst dann. Verantwortlich für diese Community bist du, nicht die Plattform.

## Verantwortlicher

[AUSFÜLLEN: Name der Person, des Vereins oder des Unternehmens]
[AUSFÜLLEN: Anschrift]
E-Mail: [AUSFÜLLEN: E-Mail-Adresse für Datenschutz-Anfragen]

## Datenschutzbeauftragte Person

[AUSFÜLLEN: Name und Kontakt — nur nötig, wenn du zur Benennung verpflichtet bist; sonst Abschnitt löschen]

## Welche Daten verarbeitet werden

- **Konto:** E-Mail-Adresse, Anzeigename, Zeitpunkt der Registrierung. [AUSFÜLLEN: weitere Felder, die du in dieser Community erhebst]
- **Inhalte:** Beiträge, Kommentare, Reaktionen und Meldungen samt Zeitpunkt und Urheber-Zuordnung.
- **Technische Daten:** Server-Protokolle mit IP-Adresse, Zeitpunkt, aufgerufener Adresse und Browser-Kennung. [AUSFÜLLEN: Aufbewahrungsdauer der Protokolle bestätigen]
- **Sitzung:** ein technisch notwendiges Cookie, damit die Anmeldung über Seitenaufrufe hinweg hält. [AUSFÜLLEN: weitere Cookies oder eingebettete Dienste ergänzen — oder bestätigen, dass es keine gibt]

## Zwecke und Rechtsgrundlagen

- Betrieb der Community, Konto und Inhalte — Art. 6 Abs. 1 lit. b DSGVO (Nutzungsverhältnis)
- Sicherheit, Missbrauchsabwehr, Protokolle — Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse)
- [AUSFÜLLEN: weitere Zwecke wie Newsletter oder Statistiken — dann in der Regel Art. 6 Abs. 1 lit. a DSGVO (Einwilligung); wenn es keine gibt, diese Zeile löschen]

## Hosting und Auftragsverarbeitung

Diese Community wird auf der Plattform Pukalani betrieben; der Plattform-Betreiber
verarbeitet die Daten in deinem Auftrag.
[AUSFÜLLEN: Name und Anschrift des Plattform-Betreibers aus deinem Vertrag]
[AUSFÜLLEN: Rechenzentrums-Dienstleister und Standort aus deinem Vertrag — im Standardfall ein Serverstandort in Deutschland]
[AUSFÜLLEN: bestätigen, dass mit den genannten Stellen Verträge zur Auftragsverarbeitung nach Art. 28 DSGVO bestehen, und die Liste vollständig halten]

## Weitere Empfänger

[AUSFÜLLEN: Empfänger außerhalb der Auftragsverarbeitung — etwa E-Mail-Versand, Zahlungsdienstleister, Analyse — je Empfänger Zweck und Rechtsgrundlage; wenn es keine gibt: „Keine."]

## Übermittlung in Drittländer

[AUSFÜLLEN: ob Daten außerhalb der EU/des EWR verarbeitet werden und auf welcher Grundlage; wenn nicht: „Es findet keine Übermittlung in Drittländer statt."]

## Speicherdauer

Konto- und Inhaltsdaten bleiben, solange das Konto besteht; nach einer Löschung
werden sie entfernt oder von der Person gelöst.
[AUSFÜLLEN: Fristen für Protokolle, Sicherungen und gesetzliche Aufbewahrungspflichten ergänzen]

## Deine Rechte

- Auskunft über die zu dir gespeicherten Daten (Art. 15 DSGVO)
- Berichtigung unrichtiger Daten (Art. 16 DSGVO)
- Löschung (Art. 17 DSGVO)
- Einschränkung der Verarbeitung (Art. 18 DSGVO)
- Datenübertragbarkeit (Art. 20 DSGVO)
- Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21 DSGVO)
- Widerruf einer Einwilligung, jederzeit und mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)

Wende dich dafür an [AUSFÜLLEN: Kontaktadresse für Datenschutz-Anfragen].
Unabhängig davon kannst du dich bei einer Datenschutz-Aufsichtsbehörde
beschweren (Art. 77 DSGVO): [AUSFÜLLEN: zuständige Aufsichtsbehörde nennen].

## Pflicht zur Bereitstellung

Für ein Konto sind E-Mail-Adresse und Anzeigename nötig; ohne sie ist keine
Teilnahme möglich. [AUSFÜLLEN: welche weiteren Angaben freiwillig sind]

## Woran sich diese Struktur orientiert

Die Abschnitte folgen den Informationspflichten aus Art. 13 und 14 DSGVO. Ob sie
für dein Angebot ausreichen und ob jede Angabe stimmt, kann nur eine Prüfung
deines konkreten Falls klären.`

const PRIVACY_EN = `> **Template — this is not legal advice.** This page is a draft and not
> published yet. Add your details, delete what does not apply, review the result
> (get legal advice if in doubt), and only then publish it. You are the
> controller for this community, not the platform.

## Controller

[FILL IN: name of the person, association or company]
[FILL IN: postal address]
Email: [FILL IN: email address for privacy requests]

## Data protection officer

[FILL IN: name and contact — only needed if you are required to appoint one; otherwise delete this section]

## What data is processed

- **Account:** email address, display name, time of registration. [FILL IN: any other fields you collect in this community]
- **Content:** posts, comments, reactions and reports, including timestamps and authorship.
- **Technical data:** server logs with IP address, time, requested address and browser identification. [FILL IN: confirm how long logs are kept]
- **Session:** one strictly necessary cookie so that a sign-in survives page loads. [FILL IN: add any further cookies or embedded services — or confirm there are none]

## Purposes and legal bases

- Running the community, accounts and content — Art. 6(1)(b) GDPR (use relationship)
- Security, abuse prevention, logs — Art. 6(1)(f) GDPR (legitimate interest)
- [FILL IN: further purposes such as newsletters or statistics — usually Art. 6(1)(a) GDPR (consent); delete this line if there are none]

## Hosting and processors

This community runs on the Pukalani platform; the platform operator processes the
data on your behalf.
[FILL IN: name and address of the platform operator, from your contract]
[FILL IN: data centre provider and location, from your contract — by default a server location in Germany]
[FILL IN: confirm that data processing agreements under Art. 28 GDPR are in place with the parties named here, and keep the list complete]

## Other recipients

[FILL IN: recipients beyond the processors above — for example email delivery, payment providers, analytics — with purpose and legal basis for each; if there are none: "None."]

## Transfers to third countries

[FILL IN: whether data is processed outside the EU/EEA and on what basis; if not: "No data is transferred to third countries."]

## Retention

Account and content data remain for as long as the account exists; after a
deletion they are removed or detached from the person.
[FILL IN: add retention periods for logs, backups and statutory obligations]

## Your rights

- Access to the data stored about you (Art. 15 GDPR)
- Rectification of inaccurate data (Art. 16 GDPR)
- Erasure (Art. 17 GDPR)
- Restriction of processing (Art. 18 GDPR)
- Data portability (Art. 20 GDPR)
- Objection to processing based on legitimate interests (Art. 21 GDPR)
- Withdrawal of consent, at any time and with effect for the future (Art. 7(3) GDPR)

To exercise them, contact [FILL IN: contact address for privacy requests].
You can also lodge a complaint with a data protection supervisory authority
(Art. 77 GDPR): [FILL IN: name the competent authority].

## Obligation to provide data

An account requires an email address and a display name; without them
participation is not possible. [FILL IN: which further details are optional]

## What this structure follows

The sections follow the information duties in Art. 13 and 14 GDPR. Whether they
are sufficient for your offering, and whether every statement is accurate, can
only be settled by a review of your specific case.`

const TEMPLATES: Record<'de' | 'en', LegalTemplate[]> = {
  de: [
    { slug: 'imprint', sortOrder: 90, title: 'Impressum', body: IMPRINT_DE },
    { slug: 'privacy', sortOrder: 91, title: 'Datenschutz', body: PRIVACY_DE },
  ],
  en: [
    { slug: 'imprint', sortOrder: 90, title: 'Imprint', body: IMPRINT_EN },
    { slug: 'privacy', sortOrder: 91, title: 'Privacy', body: PRIVACY_EN },
  ],
}

/** 'de', 'de-AT' … → de; alles andere → en (bewusster Fallback, nie leer). */
export function legalTemplateLocale(locale: string | null | undefined): 'de' | 'en' {
  return String(locale ?? '').toLowerCase().startsWith('de') ? 'de' : 'en'
}

/** Beide Vorlagen in der passenden Sprache, in Navigations-Reihenfolge. */
export function legalTemplates(locale: string | null | undefined): LegalTemplate[] {
  return TEMPLATES[legalTemplateLocale(locale)]
}

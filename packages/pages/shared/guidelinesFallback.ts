/**
 * Die Regeln-Seite für Communities, die KEINE haben (F1, kleines Paket nach
 * Stufe 4 — Davids Entscheidung 2: „jede Community bekommt einen bearbeitbaren
 * Standardtext").
 *
 * ── WARUM RÜCKFALL ZUR LAUFZEIT UND NICHT BACKFILL PER MIGRATION ────────────
 *
 * 1. **Eine Migration kann die Communities gar nicht aufzählen.** Die
 *    `pages`-Zeilen liegen im RUNTIME-Projekt (Pool), die Liste der
 *    Communities in `communities` im CONTROL-Projekt — und ein Migrationslauf
 *    bekommt genau EINEN Schlüssel für EINE Instanz. Er müsste den Bestand aus
 *    den vorhandenen `pages`-Zeilen erraten (`distinct communityId`) und
 *    verfehlte damit ausgerechnet die Communities, die noch gar keine Seite
 *    haben. Auch die SPRACHE einer Community steht drüben im Control Plane.
 * 2. **Es ist die Seite des Owners.** Genau dieser Satz steht seit Stufe 2 im
 *    Kopf von `seedGuidelinesPage.ts`: „eine Migration, die in fremde Inhalte
 *    schreibt, wäre der falsche Weg". Ein Backfill schreibt EINMAL; wer die
 *    Seite danach löscht, hat sie gelöscht. Beim Rückfall heißt Löschen wieder
 *    „dann eben die Vorlage" — und nichts von uns steht ungefragt als Zeile in
 *    fremden Daten.
 * 3. **Der Rückfall heilt die Fälle, die ein Backfill nie erwischt:** eine
 *    versehentlich gelöschte Seite, eine Community aus einem Import, eine
 *    Silo-App ohne Onboarding — und den Bestand von morgen, nicht nur den von
 *    heute.
 * 4. Er umgeht die bekannte Falle ganz: eine Spalten-Voreinstellung in
 *    Appwrite gilt nur für NEUE Zeilen (Stufe 3, 47 Zeilen NULL). Hier gibt es
 *    keine Spalte, für die das schiefgehen könnte.
 *
 * ── DER SEED BLEIBT ────────────────────────────────────────────────────────
 * `seedGuidelinesPage` legt bei der Provisionierung weiter eine echte Zeile in
 * der Sprache der Community an. Die beiden widersprechen sich nie, weil die
 * Reihenfolge eindeutig ist: **eine vorhandene Zeile gewinnt IMMER**, die
 * Vorlage erscheint nur, wenn es zu `guidelines` GAR KEINE Zeile gibt (auch
 * kein Entwurf — wer die Seite bewusst zurückgezogen hat, bekommt sie nicht
 * durch die Hintertür zurück). Der Seed ist der Normalfall, der Rückfall das
 * Netz darunter.
 *
 * ── PUR, UND ZWAR ABSICHTLICH ──────────────────────────────────────────────
 * Hier steht nur das Formen der Antwort. Die eine Frage an die Datenbank
 * („gibt es die Zeile?") sitzt in `server/utils/guidelinesPresence.ts`, weil
 * sie die Datentür braucht. So bleibt dieser Teil ohne Nitro testbar — und der
 * Text landet nicht im Client-Bundle, weil ihn nur Server-Routen importieren
 * (dieselbe Überlegung wie bei `guidelinesTemplate.ts`).
 */
import { guidelinesTemplate, guidelinesTemplateLocale, GUIDELINES_SORT_ORDER } from './guidelinesTemplate'
import { GUIDELINES_SLUG, type PageEditorRow, type PageGroup, type PublicPage, type PublicPageNavItem } from './types/page'

/**
 * Die Sprachen, in denen es die Vorlage gibt — in der Reihenfolge der Reiter
 * im Dashboard (EN ist dort die Standardsprache).
 */
export const GUIDELINES_TEMPLATE_LOCALES = ['en', 'de'] as const

/** Navigationspunkt, solange es die Seite nicht gibt. */
export function guidelinesFallbackNavItem(locale: string | null | undefined): PublicPageNavItem {
  const template = guidelinesTemplate(locale)
  return { slug: template.slug, title: template.title, sortOrder: template.sortOrder }
}

/**
 * Die öffentliche Seite selbst. Für den Besucher ist sie von einer gespeicherten
 * NICHT zu unterscheiden — das ist der Punkt: er soll die Regeln lesen können,
 * nicht unsere Datenhaltung.
 *
 * Die SPRACHE folgt hier der Anfrage, nicht einer bei der Anlage eingefrorenen
 * Wahl: es gibt keine Zeile, die eine Sprache festlegen könnte, also bekommt
 * jeder Leser die Fassung, die er lesen kann.
 *
 * `updatedAt` bleibt LEER. Ein erfundener Zeitstempel wäre eine Aussage über
 * eine Bearbeitung, die nie stattgefunden hat; das Feld wird heute von
 * niemandem gerendert.
 */
export function guidelinesFallbackPage(locale: string | null | undefined): PublicPage {
  const resolved = guidelinesTemplateLocale(locale)
  const template = guidelinesTemplate(resolved)
  return { slug: template.slug, locale: resolved, title: template.title, body: template.body, updatedAt: '' }
}

/**
 * Der Eintrag in der Seiten-Liste des Dashboards. `status: 'published'` ist
 * keine Beschönigung, sondern die Wahrheit über die WIRKUNG: die Vorlage steht
 * öffentlich auf der Seite. Dass keine Zeile dahintersteckt, sagt `isTemplate`
 * — die Liste zeigt es als eigenes Abzeichen.
 */
export function guidelinesFallbackGroup(): PageGroup {
  return {
    slug: GUIDELINES_SLUG,
    sortOrder: GUIDELINES_SORT_ORDER,
    isTemplate: true,
    locales: GUIDELINES_TEMPLATE_LOCALES.map(locale => ({
      // Leer, weil es sie nicht gibt — die Liste schlüsselt über `locale`
      // (slug+locale ist ohnehin eindeutig, uq_slug_locale_tenant).
      $id: '',
      locale,
      title: guidelinesTemplate(locale).title,
      status: 'published' as const,
    })),
  }
}

/**
 * Was der Editor vorgefüllt bekommt. BEIDE Sprachen, anders als beim Seed:
 * der Seed kennt die Sprache der Community aus dem Wizard, hier weiß es
 * niemand — und ein Owner, der den Reiter wechselt, soll dort nicht vor einem
 * leeren Feld stehen. Gespeichert wird ohnehin je Reiter einzeln, es entsteht
 * also nur, was er wirklich abschickt.
 */
export function guidelinesFallbackEditorRows(): PageEditorRow[] {
  return GUIDELINES_TEMPLATE_LOCALES.map((locale) => {
    const template = guidelinesTemplate(locale)
    return { locale, title: template.title, body: template.body, status: 'published' as const, sortOrder: template.sortOrder }
  })
}

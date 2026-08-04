/**
 * Die URL-Regel der Discussions (F1, Davids Entscheidung vom 2026-08-03).
 *
 *   /discussions/<kategorie>
 *   /discussions/<kategorie>/<id>/<slug>
 *
 * DIE ID IST DIE WAHRHEIT. Kategorie-Segment UND Slug sind Deko: der Server
 * löst AUSSCHLIESSLICH über die Row-Id auf, und stimmt eines der beiden
 * Deko-Segmente nicht mit dem heutigen Zustand überein, antwortet er 301 auf
 * die kanonische URL. Das ist der Grund, warum die Id überhaupt in der URL
 * steht (Reddit-/StackOverflow-Muster).
 *
 * Was das kauft: Umbenennen eines Topics und Umkategorisieren sind gratis —
 * jeder alte Link führt für immer ans Ziel, und es entsteht kein Duplicate
 * Content, weil nicht-kanonische Varianten NIE rendern (sie leiten vorher um).
 *
 * VERWORFENE ALTERNATIVE: Alt-Slugs in einer Tabelle mitschreiben (Discourse-
 * Muster). Das kostet eine zweite Tabelle, einen zweiten Nachschlagepfad und
 * eine Aufräumfrage — und kauft nichts, was die Id nicht schon liefert.
 *
 * PURE (unit-getestet): keine Nuxt-, keine Appwrite-Abhängigkeit. Server
 * (Redirect-Entscheidung, kanonischer Pfad in der Antwort) und Client (Links,
 * SSR-Guard auf der Detailseite) rechnen mit derselben Funktion — sonst hätte
 * eine 301-Schleife zwei Ursachen statt einer.
 */

export const DISCUSSIONS_BASE = '/discussions'

/** Obergrenze eines abgeleiteten Slugs — lang genug zum Lesen, kurz genug für
 *  Mail-Clients, die lange URLs umbrechen. */
export const MAX_TOPIC_SLUG = 80

/** Rückfall, wenn aus Titel UND Text kein einziges slug-fähiges Zeichen fällt
 *  (reine Emoji-/CJK-Titel). Ein leeres Segment wäre eine kaputte URL. */
export const TOPIC_SLUG_FALLBACK = 'topic'

/**
 * Deutsche Umlaute werden AUSGESCHRIEBEN, nicht entfernt: „Grüße" → `gruesse`,
 * nicht `gre`. Alles Übrige geht über die Unicode-Zerlegung (NFD) und verliert
 * seine diakritischen Zeichen — `é` → `e`.
 */
const UMLAUTS: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
}

/** Text → URL-Segment: klein, nur a–z/0–9, Bindestrich als Trenner. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüß]/g, char => UMLAUTS[char] ?? char)
    .normalize('NFD')
    // Kombinierende diakritische Zeichen (U+0300–U+036F) — nach NFD hängen sie
    // als eigene Codepoints hinter dem Grundbuchstaben und fallen hier weg.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TOPIC_SLUG)
    .replace(/-+$/g, '')
}

/**
 * Der Slug eines Topics.
 *
 * Titel zuerst, Text als Rückfall: Umfragen und Fragen tragen ihre Frage oft
 * nur im `body` (siehe CommunityPost.title — bewusst optional), und ein Link,
 * der bei jedem zweiten Topic `…/topic` heißt, ist keiner. Preis dieser
 * Bequemlichkeit: wer den TEXT eines titellosen Topics ändert, bekommt einen
 * neuen kanonischen Slug — die alte URL leitet dann um. Genau dafür ist die
 * 301-Regel da, es geht kein Link verloren.
 */
export function topicSlug(title: string | null | undefined, body: string): string {
  return slugify(title ?? '') || slugify(body.slice(0, 200)) || TOPIC_SLUG_FALLBACK
}

export function discussionCategoryPath(categorySlug: string): string {
  return `${DISCUSSIONS_BASE}/${categorySlug}`
}

/** Kanonischer Pfad eines Topics — OHNE Locale-Prefix (den setzt localePath()). */
export function discussionTopicPath(categorySlug: string, id: string, slug: string): string {
  return `${discussionCategoryPath(categorySlug)}/${id}/${slug}`
}

export interface CanonicalTopicInput {
  /** Kategorie-Segment aus der URL (bereits URL-dekodiert). */
  requestedCategory: string
  /** Slug-Segment aus der URL (bereits URL-dekodiert). */
  requestedSlug: string
  /** Kategorie-Slug, wie er HEUTE an der Zeile hängt. */
  canonicalCategory: string
  /** Slug, wie er sich HEUTE aus dem Topic ableitet. */
  canonicalSlug: string
  /** Row-Id des Topics — die Wahrheit, wird nie verglichen. */
  id: string
}

export type CanonicalTopicDecision =
  | { ok: true }
  | { ok: false, to: string }

/**
 * Zeigt die aufgerufene URL auf die kanonische Fassung — oder wohin sie
 * stattdessen gehört (301).
 *
 * Verglichen wird ZEICHENGENAU. Eine Groß-/Kleinschreibungs-Variante
 * (`/discussions/Pukalani/…`) ist damit nicht-kanonisch und leitet um; das ist
 * gewollt, sonst existierte jedes Topic unter beliebig vielen Schreibweisen.
 */
export function resolveCanonicalTopicRoute(input: CanonicalTopicInput): CanonicalTopicDecision {
  const canonical = discussionTopicPath(input.canonicalCategory, input.id, input.canonicalSlug)
  if (input.requestedCategory === input.canonicalCategory && input.requestedSlug === input.canonicalSlug) {
    return { ok: true }
  }
  return { ok: false, to: canonical }
}

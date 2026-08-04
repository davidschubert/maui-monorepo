/**
 * DER ABZEICHEN-KATALOG (F1 Stufe 4, Konzept § 3.6 + Teil 4).
 *
 * PURE (unit-getestet): Server (Verleihung) und Client (Galerie, Fortschritt)
 * lesen dieselbe Liste. Ein Abzeichen, dessen Bedingung der Server nicht kennt,
 * ist damit nicht anzeigbar — und eines, das die Oberflaeche nicht kennt, wird
 * nicht heimlich verliehen.
 *
 * ── DER ZUSCHNITT: NUR, WAS HEUTE MESSBAR IST ─────────────────────────────
 * Davids Vorgabe fuer Stufe 4 lautet „nur heute messbare Abzeichen … fehlende
 * kommen automatisch dazu, sobald ihre Funktion existiert". Der Katalog aus
 * § 3.6 hat 40+ Eintraege; hier stehen 16 (3 + 7 + 6 — ein Test haelt die Zahl
 * an den Katalog gebunden, damit dieser Satz nicht mit der Zeit unwahr wird).
 * Was fehlt und WARUM, gehoert an diese Stelle und nicht in eine Notiz, sonst
 * reicht es irgendwann jemand „nach", ohne den Preis zu kennen:
 *
 *  - **Dauerhaft gestrichen (Davids Entscheidung, Teil 4)** — alles, was ein
 *    personenbezogenes Verhaltensprotokoll braeuchte: Reader, Read Guidelines,
 *    Enthusiast/Aficionado/Devotee (Besuchs-Streaks),
 *    Nice/Good/Great Share und Popular/Hot/Famous Link (Klick-Zaehlung).
 *    Neun Abzeichen, und sie kommen NICHT spaeter.
 *  - **Wartet auf seine Funktion** — First Emoji, First Quote, First Link,
 *    First Reaction, First Onebox, First Reply By Email, Wiki Editor,
 *    Certified/Licensed, Promoter/Campaigner/Champion (Einladungen durch
 *    Mitglieder), Out of Love/Higher Love/Crazy in Love (Tages-Like-Limit).
 *    Die Reihenfolge dieser Funktionen steht in Teil 4.
 *  - **Trust Level (TL1–TL4)** ist ausgespart: Davids Entscheidung 5 macht
 *    daraus ein eigenes Projekt mit eigenem Ja.
 *  - **Editor** („ersten eigenen Beitrag bearbeitet") ist NICHT baubar, obwohl
 *    es so aussieht: `community_posts` hat keine Spalte, die eine Bearbeitung
 *    festhaelt (`comments` hat `editedAt`, `posts` nicht). Das halbe Abzeichen
 *    nur fuer Antworten zu verleihen waere schlimmer als keines — es hiesse
 *    „Beitrag" und meinte etwas anderes.
 *  - **Anniversary** („1 Jahr Mitglied") hat im Mandanten-Kontext keine
 *    Quelle: das Beitrittsdatum steht in `community_members` im CONTROL PLANE
 *    — derselbe Grund, aus dem die About-Seite „N Beitritte in 7 Tagen" nicht
 *    zeigt. Die naheliegenden Ersatzquellen beantworten eine andere Frage
 *    (`$createdAt` des Kontos = Registrierung IRGENDWO im Pool, `user.joined`
 *    im Aktivitaets-Feed = nur wer sich auf dem Host registriert hat, nicht
 *    wer per A5 durch Mitschreiben beigetreten ist).
 *  - **New User of the Month** ist eine Rangliste („die 2 besten Neulinge je
 *    Monat"), also ein Vergleich zwischen Menschen plus ein Monats-Lauf —
 *    beides gibt es hier nicht, und beides ist mehr als ein Abzeichen.
 *
 * ── LIKE = UPVOTE (Davids Entscheidung 4) ─────────────────────────────────
 * Alle „Like"-Zahlen des Katalogs sind UPVOTES. Downvotes bleiben und sind
 * abzeichen-neutral; ein Beitrag mit 30 Auf- und 30 Abstimmen hat 30 Likes,
 * nicht 0. Das ist wichtig, weil `score` genau die andere Rechnung ist.
 *
 * ── JEDES ABZEICHEN GENAU EINMAL ──────────────────────────────────────────
 * Discourse verleiht einige mehrfach („some of them multiple times"). Hier
 * nicht, und das ist eine Folge der Zaehlweise, keine Nachlaessigkeit: gezaehlt
 * wird mit AGGREGATEN („wie viele meiner Beitraege haben ≥10 Upvotes?"), also
 * mit einer festen Zahl von Abfragen, egal wie lang jemand dabei ist. „Wie
 * OFT" verlangte, jedes qualifizierende Stueck einzeln zu benennen — das
 * heisst, die gesamte Inhalts-Geschichte eines Menschen zu lesen. Das gehoert
 * zu einer Zaehler-Infrastruktur, die beim Schreiben mitschreibt, und die ist
 * eine eigene Stufe.
 */

export const BADGE_GROUPS = ['gettingStarted', 'community', 'posting'] as const
export type BadgeGroup = (typeof BADGE_GROUPS)[number]

/** „So viele EIGENE Inhalte mit mindestens so vielen Upvotes." */
export interface LikedItemsRequirement {
  /** Geforderte Upvotes je Inhalt. */
  threshold: number
  /** Wie viele Inhalte diese Schwelle erreichen muessen. */
  count: number
}

/**
 * Die Bedingung eines Abzeichens. Alle gesetzten Felder muessen erfuellt sein
 * (UND, nie ODER) — im Katalog gibt es dafuer keinen Fall, und ein ODER waere
 * eine Bedingung, die man nicht mehr in einem Satz erklaeren kann.
 */
export interface BadgeRequirement {
  /** Text ueber sich UND Profilbild. */
  profileComplete?: true
  /** Mindestens so viele selbst vergebene Upvotes. */
  likesGiven?: number
  /** Mindestens so viele abgesetzte Meldungen. */
  flagsRaised?: number
  /** Eigene Inhalte JEDER Art. */
  likedItems?: LikedItemsRequirement
  /** Nur eigenstaendige Beitraege. */
  likedTopics?: LikedItemsRequirement
  /** Nur eigene Antworten. */
  likedReplies?: LikedItemsRequirement
}

export interface BadgeDefinition {
  key: string
  group: BadgeGroup
  requires: BadgeRequirement
}

/**
 * Der Katalog. Die REIHENFOLGE ist die Anzeige-Reihenfolge: innerhalb einer
 * Gruppe vom leicht Erreichbaren zum Seltenen, damit die Galerie einen Weg
 * zeigt statt einer Wand.
 */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  // ── Der Anfang: drei erste Male ────────────────────────────────────────
  { key: 'profile', group: 'gettingStarted', requires: { profileComplete: true } },
  { key: 'first-like', group: 'gettingStarted', requires: { likesGiven: 1 } },
  { key: 'first-flag', group: 'gettingStarted', requires: { flagsRaised: 1 } },

  // ── Die Gemeinschaft: Zuspruch bekommen UND geben ─────────────────────
  { key: 'welcome', group: 'community', requires: { likedItems: { threshold: 1, count: 1 } } },
  { key: 'appreciated', group: 'community', requires: { likedItems: { threshold: 1, count: 20 } } },
  { key: 'thank-you', group: 'community', requires: { likedItems: { threshold: 1, count: 20 }, likesGiven: 10 } },
  { key: 'gives-back', group: 'community', requires: { likedItems: { threshold: 1, count: 100 }, likesGiven: 100 } },
  { key: 'empathetic', group: 'community', requires: { likedItems: { threshold: 1, count: 500 }, likesGiven: 1000 } },
  { key: 'respected', group: 'community', requires: { likedItems: { threshold: 2, count: 100 } } },
  { key: 'admired', group: 'community', requires: { likedItems: { threshold: 5, count: 300 } } },

  // ── Das Schreiben: EIN Stueck, das eingeschlagen hat ──────────────────
  { key: 'nice-topic', group: 'posting', requires: { likedTopics: { threshold: 10, count: 1 } } },
  { key: 'good-topic', group: 'posting', requires: { likedTopics: { threshold: 25, count: 1 } } },
  { key: 'great-topic', group: 'posting', requires: { likedTopics: { threshold: 50, count: 1 } } },
  { key: 'nice-reply', group: 'posting', requires: { likedReplies: { threshold: 10, count: 1 } } },
  { key: 'good-reply', group: 'posting', requires: { likedReplies: { threshold: 25, count: 1 } } },
  { key: 'great-reply', group: 'posting', requires: { likedReplies: { threshold: 50, count: 1 } } },
]

/** Die gemessenen Zahlen, gegen die der Katalog geprueft wird. */
export interface BadgeFacts {
  profileComplete: boolean
  likesGiven: number
  flagsRaised: number
  /** Schwelle → Anzahl eigener Inhalte, die sie erreichen. */
  likedItems: Record<number, number>
  likedTopics: Record<number, number>
  likedReplies: Record<number, number>
}

export function emptyBadgeFacts(): BadgeFacts {
  return { profileComplete: false, likesGiven: 0, flagsRaised: 0, likedItems: {}, likedTopics: {}, likedReplies: {} }
}

/**
 * ALLE Schwellen, nach denen der Katalog fragt — aufsteigend, ohne Doppel.
 *
 * DER GRUND, WARUM SIE ABGELEITET UND NICHT AUFGESCHRIEBEN IST: die Quellen
 * bezahlen jede Schwelle mit einer Abfrage. Eine Liste von Hand waere
 * entweder zu lang (bezahlte Schwellen, die niemand braucht) oder zu kurz
 * (ein Abzeichen, dessen Zahl nie gemessen wird und das deshalb NIE verliehen
 * wird — lautlos, weil eine fehlende Zahl wie eine 0 aussieht).
 */
export function badgeThresholds(catalog: readonly BadgeDefinition[] = BADGE_CATALOG): number[] {
  const seen = new Set<number>()
  for (const badge of catalog) {
    for (const requirement of [badge.requires.likedItems, badge.requires.likedTopics, badge.requires.likedReplies]) {
      if (requirement) seen.add(requirement.threshold)
    }
  }
  return [...seen].sort((a, b) => a - b)
}

function meetsLikedItems(measured: Record<number, number>, requirement: LikedItemsRequirement | undefined): boolean {
  if (!requirement) return true
  return (measured[requirement.threshold] ?? 0) >= requirement.count
}

/** Erfuellt dieser Mensch die Bedingung dieses Abzeichens? */
export function badgeEarned(badge: BadgeDefinition, facts: BadgeFacts): boolean {
  const { requires } = badge
  if (requires.profileComplete && !facts.profileComplete) return false
  if (requires.likesGiven !== undefined && facts.likesGiven < requires.likesGiven) return false
  if (requires.flagsRaised !== undefined && facts.flagsRaised < requires.flagsRaised) return false
  if (!meetsLikedItems(facts.likedItems, requires.likedItems)) return false
  if (!meetsLikedItems(facts.likedTopics, requires.likedTopics)) return false
  if (!meetsLikedItems(facts.likedReplies, requires.likedReplies)) return false
  return true
}

/** Die Schluessel aller heute erfuellten Abzeichen, in Katalog-Reihenfolge. */
export function earnedBadgeKeys(facts: BadgeFacts, catalog: readonly BadgeDefinition[] = BADGE_CATALOG): string[] {
  return catalog.filter(badge => badgeEarned(badge, facts)).map(badge => badge.key)
}

export interface BadgeProgress {
  current: number
  target: number
}

/**
 * Wie weit ist dieser Mensch? — `null`, wenn die Frage nicht ehrlich zu
 * beantworten ist.
 *
 * NUR BEI GENAU EINER ZAEHLBAREN BEDINGUNG, und das ist der springende Punkt.
 * „Dankeschoen" verlangt ZWEI Dinge (20-mal gelobt worden UND 10-mal gelobt
 * haben). Ein einzelner Balken muesste sich fuer eines entscheiden — und
 * „18 von 20" neben einem unerfuellten zweiten Teil liest sich wie „fast
 * geschafft", obwohl noch zehn vergebene Stimmen fehlen. Zwei Balken waeren
 * ehrlich und trotzdem falsch: sie machten aus einem Abzeichen eine
 * Aufgabenliste. Also gar keiner, und der Bedingungstext sagt beides.
 *
 * Auch bei den „ersten Malen" (Ziel 1) gibt es keinen Balken: dort ist der
 * Fortschritt entweder 0 oder fertig, und ein Balken mit zwei Zustaenden ist
 * nur eine umstaendliche Form des Hakens.
 */
export function badgeProgress(badge: BadgeDefinition, facts: BadgeFacts): BadgeProgress | null {
  const countable: BadgeProgress[] = []
  if (badge.requires.likesGiven !== undefined) countable.push({ current: facts.likesGiven, target: badge.requires.likesGiven })
  if (badge.requires.flagsRaised !== undefined) countable.push({ current: facts.flagsRaised, target: badge.requires.flagsRaised })
  if (badge.requires.likedItems) countable.push({ current: facts.likedItems[badge.requires.likedItems.threshold] ?? 0, target: badge.requires.likedItems.count })
  if (badge.requires.likedTopics) countable.push({ current: facts.likedTopics[badge.requires.likedTopics.threshold] ?? 0, target: badge.requires.likedTopics.count })
  if (badge.requires.likedReplies) countable.push({ current: facts.likedReplies[badge.requires.likedReplies.threshold] ?? 0, target: badge.requires.likedReplies.count })

  const only = countable.length === 1 ? countable[0] : undefined
  if (!only || only.target <= 1) return null
  return { current: Math.min(only.current, only.target), target: only.target }
}

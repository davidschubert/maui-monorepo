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
 * § 3.6 hat 40+ Eintraege; hier stehen 18 (4 + 8 + 6 — ein Test haelt die Zahl
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
 *  - **Editor** („ersten eigenen Beitrag bearbeitet") stand hier bis zum
 *    2026-08-04 als NICHT BAUBAR: `community_posts` hielt keine Bearbeitung
 *    fest (`comments` hatte `editedAt`, `posts` nicht), und das halbe Abzeichen
 *    nur fuer Antworten zu verleihen waere schlimmer als keines gewesen — es
 *    hiesse „Beitrag" und meinte etwas anderes. Beide Haelften sind jetzt da:
 *    `posts.editedAt` (Migration posts-014) und der mitschreibende Zaehler
 *    `edits`, den BEIDE Layer speisen. Gezaehlt werden nur Bearbeitungen
 *    EIGENER Inhalte — beide Routen lassen ohnehin nur den Autor durch, ein
 *    Moderator, der fremdes aufraeumt, verdient hier nichts.
 *    EINE EHRLICHE GRENZE GEHOERT DAZU: `edits` beginnt fuer alle bei 0. Eine
 *    Bearbeitung hinterlaesst einen Zeitstempel, keine Anzahl — wer vor der
 *    Umstellung nachgebessert hat, ist davon nicht zu unterscheiden. Das
 *    Abzeichen zaehlt ab jetzt.
 *  - **Anniversary** („Jahrestag") war bis 2026-08-04 aus demselben Grund
 *    draussen und ist es NICHT MEHR: das Beitrittsdatum steht weiterhin in
 *    `community_members` im CONTROL PLANE, aber es gibt jetzt einen Weg
 *    dorthin (`registerCommunityJoinDatesResolver` in core, Implementierung im
 *    control-Layer, verdrahtet in apps/platform). Die naheliegenden
 *    Ersatzquellen bleiben falsch und werden ausdruecklich NICHT benutzt:
 *    `$createdAt` des Kontos = Registrierung IRGENDWO im Pool, `user.joined`
 *    im Aktivitaets-Feed = nur wer sich auf dem Host registriert hat, nicht
 *    wer per A5 durch Mitschreiben beigetreten ist. Ohne den Resolver (Silo,
 *    apps/comments) bleibt das Abzeichen unverdient statt falsch verliehen.
 *  - **New User of the Month** ist eine Rangliste („die 2 besten Neulinge je
 *    Monat"), also ein Vergleich zwischen Menschen plus ein Monats-Lauf —
 *    beides gibt es hier nicht, und beides ist mehr als ein Abzeichen.
 *
 * ── LIKE = UPVOTE (Davids Entscheidung 4) ─────────────────────────────────
 * Alle „Like"-Zahlen des Katalogs sind UPVOTES. Downvotes bleiben und sind
 * abzeichen-neutral; ein Beitrag mit 30 Auf- und 30 Abstimmen hat 30 Likes,
 * nicht 0. Das ist wichtig, weil `score` genau die andere Rechnung ist.
 *
 * ── HEUTE NOCH: JEDES ABZEICHEN GENAU EINMAL ──────────────────────────────
 * Discourse verleiht einige mehrfach, und David hat entschieden, dass ALLE
 * sinnvoll zaehlbaren es kuenftig tun sollen. GEBAUT ist das hier NICHT — es
 * ist das zweite Teilpaket des gemeinsamen Pakets (Konzept Teil 5, Punkt 5),
 * zusammen mit der Benachrichtigung.
 *
 * Was in diesem Teilpaket entstanden ist, ist die VORAUSSETZUNG dafuer: die
 * mitschreibenden Zaehler (`member_counters`, Migration posts-013). Der Grund
 * fuer „genau einmal" war naemlich nie eine Bequemlichkeit, sondern die
 * Zaehlweise — mit AGGREGATEN („wie viele meiner Beitraege haben ≥10 Upvotes?")
 * gibt es keine Ereignisse, nur Staende, und „wie OFT" verlangte, die gesamte
 * Inhalts-Geschichte eines Menschen zu lesen. Mit einem Zaehler, der beim
 * Schreiben mitschreibt, ist die Frage beantwortbar. Beantwortet wird sie im
 * naechsten Teilpaket.
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

/** „So viele EIGENE Inhalte innerhalb der letzten so-und-so-viel Tage." */
export interface RecentContentRequirement {
  /** Groesse des zurueckliegenden Fensters in Tagen. */
  withinDays: number
  /** Wie viele eigene Inhalte darin liegen muessen. */
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
  /**
   * Mindestens so viele Bearbeitungen EIGENER Inhalte.
   *
   * Der erste Wert, der NICHT aus einem Aggregat kommt, sondern aus dem
   * mitschreibenden Zaehler (`member_counters.edits`) — eine Bearbeitung
   * hinterlaesst in den Inhalts-Tabellen nur einen Zeitstempel. Folge: er
   * beginnt fuer jeden bei 0, auch fuer den, der jahrelang nachgebessert hat.
   */
  edits?: number
  /** Eigene Inhalte JEDER Art. */
  likedItems?: LikedItemsRequirement
  /** Nur eigenstaendige Beitraege. */
  likedTopics?: LikedItemsRequirement
  /** Nur eigene Antworten. */
  likedReplies?: LikedItemsRequirement
  /**
   * Mindest-Zugehoerigkeit in Tagen (Beitrittsdatum aus dem Control Plane).
   *
   * IST DIE DAUER UNBEKANNT, GILT DIE BEDINGUNG ALS NICHT ERFUELLT — anders
   * als bei den Zaehlern, wo ein fehlender Wert zu 0 wird und damit ohnehin
   * unter jeder Schwelle liegt. Hier muss die Regel es ausdruecklich sagen,
   * weil „unbekannt" sonst als „lange genug" durchginge.
   */
  memberForDays?: number
  /** Eigene Inhalte JEDER Art im zurueckliegenden Fenster. */
  recentContent?: RecentContentRequirement
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
  /**
   * „Editor": einmal am eigenen Text nachgebessert.
   *
   * EINMALIG, obwohl `edits` weiterzaehlt — der Katalog sagt „ersten eigenen
   * Beitrag bearbeitet", und das ist ein ERSTES MAL wie die drei darueber.
   * (Davids Mehrfach-Regel im naechsten Teilpaket meint qualifizierende
   * EREIGNISSE ueber einer Schwelle, nicht ein erstes Mal, das es nur einmal
   * geben kann.)
   */
  { key: 'editor', group: 'gettingStarted', requires: { edits: 1 } },

  // ── Die Gemeinschaft: Zuspruch bekommen UND geben ─────────────────────
  { key: 'welcome', group: 'community', requires: { likedItems: { threshold: 1, count: 1 } } },
  { key: 'appreciated', group: 'community', requires: { likedItems: { threshold: 1, count: 20 } } },
  { key: 'thank-you', group: 'community', requires: { likedItems: { threshold: 1, count: 20 }, likesGiven: 10 } },
  { key: 'gives-back', group: 'community', requires: { likedItems: { threshold: 1, count: 100 }, likesGiven: 100 } },
  { key: 'empathetic', group: 'community', requires: { likedItems: { threshold: 1, count: 500 }, likesGiven: 1000 } },
  { key: 'respected', group: 'community', requires: { likedItems: { threshold: 2, count: 100 } } },
  { key: 'admired', group: 'community', requires: { likedItems: { threshold: 5, count: 300 } } },

  /**
   * Der Jahrestag: dabei UND dabeigeblieben.
   *
   * BEIDE HAELFTEN, weil Davids Katalog beide nennt („1 Jahr Mitglied + ≥1
   * Beitrag in dem Jahr"). Ein Abzeichen nur fuer Zeitablauf waere kein
   * Verdienst, sondern ein Kalendereintrag — es bekaeme auch, wer sich vor
   * einem Jahr einmal umgesehen hat und nie wieder da war.
   *
   * BEIM HINSEHEN, nicht am Stichtag: die Bedingung fragt „liegt der Beitritt
   * mindestens 365 Tage zurueck und steht im letzten Jahr etwas von mir?".
   * Wer im dritten Jahr nachsieht und im dritten Jahr geschrieben hat, bekommt
   * es genauso — das ist die Folge der Zaehlweise (Aggregate statt Historie)
   * und passt zu „jedes Abzeichen genau einmal".
   */
  { key: 'anniversary', group: 'community', requires: { memberForDays: 365, recentContent: { withinDays: 365, count: 1 } } },

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
  /** Bearbeitungen eigener Inhalte (mitschreibender Zaehler, nie ein Aggregat). */
  edits: number
  /** Schwelle → Anzahl eigener Inhalte, die sie erreichen. */
  likedItems: Record<number, number>
  likedTopics: Record<number, number>
  likedReplies: Record<number, number>
  /**
   * Tage seit dem Beitritt — `null` heisst UNBEKANNT, nicht „null Tage".
   *
   * Unbekannt ist der Normalfall in jeder App ohne Control-Plane-Naht
   * (apps/comments, Playground) und bei jedem, der hier gar kein Mitglied ist.
   */
  memberForDays: number | null
  /** Eigene Inhalte im Fenster aus `badgeContentWindowDays()`. */
  recentContent: number
}

export function emptyBadgeFacts(): BadgeFacts {
  return {
    profileComplete: false,
    likesGiven: 0,
    flagsRaised: 0,
    edits: 0,
    likedItems: {},
    likedTopics: {},
    likedReplies: {},
    memberForDays: null,
    recentContent: 0,
  }
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

const DAY_MS = 86_400_000

/**
 * Das Zeitfenster (Tage), fuer das die Quellen zaehlen muessen — `null`, wenn
 * kein Abzeichen eines verlangt.
 *
 * ABGELEITET, nicht aufgeschrieben, aus demselben Grund wie `badgeThresholds()`:
 * eine Zahl von Hand waere die Stelle, an der ein neues Abzeichen lautlos
 * unerreichbar wird. Mehrere VERSCHIEDENE Fenster gaebe es hier nicht sinnvoll
 * — jedes waere eine eigene Abfrage je Quelle —, deshalb gewinnt das GROESSTE:
 * ein zu weites Fenster verleiht hoechstens ein Abzeichen frueher, ein zu enges
 * nie. Sollte je ein zweites Fenster wirklich gebraucht werden, ist der Zaehler
 * mit dem Fenster im Namen (wie bei den Schwellen) die richtige Antwort.
 */
export function badgeContentWindowDays(catalog: readonly BadgeDefinition[] = BADGE_CATALOG): number | null {
  let widest: number | null = null
  for (const badge of catalog) {
    const window = badge.requires.recentContent?.withinDays
    if (window !== undefined && (widest === null || window > widest)) widest = window
  }
  return widest
}

/**
 * Die KLEINSTE geforderte Zugehoerigkeit (Tage) — `null`, wenn keine gefordert
 * wird.
 *
 * Wofuer: die Auswertestelle fragt das Zeitfenster nur ab, wenn ueberhaupt ein
 * Abzeichen dadurch erreichbar waere. Die kleinste Dauer ist dafuer die
 * richtige Grenze — bei der groessten fiele ein Abzeichen mit kuerzerer
 * Zugehoerigkeit unter den Tisch.
 */
export function badgeMemberDays(catalog: readonly BadgeDefinition[] = BADGE_CATALOG): number | null {
  let smallest: number | null = null
  for (const badge of catalog) {
    const days = badge.requires.memberForDays
    if (days !== undefined && (smallest === null || days < smallest)) smallest = days
  }
  return smallest
}

/**
 * PURE: wie viele volle Tage liegt dieser Beitritt zurueck? `null` = unbekannt.
 *
 * Abgerundet auf volle Tage, damit „365" wirklich ein volles Jahr bedeutet und
 * nicht 364 Tage und 23 Stunden. Ein Datum in der ZUKUNFT (Uhren laufen
 * auseinander) ergibt 0, nie eine negative Dauer.
 */
export function membershipDays(joinedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!joinedAt) return null
  const joined = Date.parse(joinedAt)
  if (Number.isNaN(joined)) return null
  return Math.max(0, Math.floor((now.getTime() - joined) / DAY_MS))
}

/** PURE: der Beginn eines zurueckliegenden Fensters als ISO-Zeitpunkt. */
export function contentWindowStartIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString()
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
  if (requires.edits !== undefined && facts.edits < requires.edits) return false
  if (!meetsLikedItems(facts.likedItems, requires.likedItems)) return false
  if (!meetsLikedItems(facts.likedTopics, requires.likedTopics)) return false
  if (!meetsLikedItems(facts.likedReplies, requires.likedReplies)) return false
  // Unbekannte Zugehoerigkeit ist NICHT erfuellt — sonst bekaeme das Abzeichen
  // ausgerechnet dort jeder, wo die Naht zum Control Plane fehlt.
  if (requires.memberForDays !== undefined && (facts.memberForDays === null || facts.memberForDays < requires.memberForDays)) return false
  if (requires.recentContent && facts.recentContent < requires.recentContent.count) return false
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
 *
 * ZUGEHOERIGKEIT UND ZEITFENSTER ZAEHLEN HIER BEWUSST NICHT MIT. „180 von 365
 * Tagen" ist kein Fortschritt, sondern ein Countdown — man kommt ihm nicht
 * naeher, indem man etwas tut. Und der einzige Traeger dieser Bedingungen
 * („Jahrestag") verlangt ohnehin zwei Dinge, waere hier also stumm.
 */
export function badgeProgress(badge: BadgeDefinition, facts: BadgeFacts): BadgeProgress | null {
  const countable: BadgeProgress[] = []
  if (badge.requires.likesGiven !== undefined) countable.push({ current: facts.likesGiven, target: badge.requires.likesGiven })
  if (badge.requires.flagsRaised !== undefined) countable.push({ current: facts.flagsRaised, target: badge.requires.flagsRaised })
  if (badge.requires.edits !== undefined) countable.push({ current: facts.edits, target: badge.requires.edits })
  if (badge.requires.likedItems) countable.push({ current: facts.likedItems[badge.requires.likedItems.threshold] ?? 0, target: badge.requires.likedItems.count })
  if (badge.requires.likedTopics) countable.push({ current: facts.likedTopics[badge.requires.likedTopics.threshold] ?? 0, target: badge.requires.likedTopics.count })
  if (badge.requires.likedReplies) countable.push({ current: facts.likedReplies[badge.requires.likedReplies.threshold] ?? 0, target: badge.requires.likedReplies.count })

  const only = countable.length === 1 ? countable[0] : undefined
  if (!only || only.target <= 1) return null
  return { current: Math.min(only.current, only.target), target: only.target }
}

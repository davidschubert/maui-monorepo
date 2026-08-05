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
 * § 3.6 hat 40+ Eintraege; hier stehen 22 (4 + 8 + 6 + 4 — ein Test haelt die
 * Zahl an den Katalog gebunden, damit dieser Satz nicht mit der Zeit unwahr
 * wird).
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
 *  - **Trust Level (TL1–TL4)** war ausgespart und ist es NICHT MEHR: Davids
 *    Entscheidung 5 machte daraus ein eigenes Projekt mit eigenem Ja, und
 *    dieses Ja ist am 2026-08-04 gefallen (F1 Teilpaket 3). Die vier stehen
 *    jetzt als eigene Gruppe im Katalog. Sie sind die EINZIGEN, deren Bedingung
 *    nicht aus Zahlen dieses Layers besteht, sondern aus einer STUFE
 *    (`shared/trustLevels.ts`) — das Abzeichen ist die Feier, das Recht kommt
 *    vom RBAC (core/shared/trustLevel.ts).
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
 * ── MEHRFACH VERLEIHEN, WO ES EIN NEUES EREIGNIS GIBT ─────────────────────
 * Die frueher hier stehende Zeile „jedes Abzeichen genau einmal" ist mit Davids
 * Entscheidung vom 2026-08-04 REVIDIERT (Konzept Teil 5, dritte
 * Architektur-Entscheidung). Sie war nie eine Bequemlichkeit, sondern eine
 * Folge der Zaehlweise: mit AGGREGATEN („wie viele meiner Beitraege haben ≥10
 * Upvotes?") gibt es keine Ereignisse, nur Staende. Seit die Zaehler beim
 * SCHREIBEN mitschreiben (`member_counters`, posts-013) und die Stimm-Routen
 * den neuen Stand EINES Stuecks melden (`reportContentUpvotes`), ist die Frage
 * „ist seit dem letzten Mal etwas Neues dazugekommen?" beantwortbar.
 *
 * Die Regel steht als FELD am Katalog-Eintrag (`awardedPer`) und nicht in
 * verstreuten Abfragen — sonst waere „darf dieses Abzeichen zweimal kommen?"
 * eine Frage, die man an drei Stellen verschieden beantworten kann:
 *
 *  - `'once'` — ein ERSTES MAL oder ein ZUSTAND. Es gibt kein zweites Ereignis:
 *    das erste vergebene Like ist einmal das erste, ein ausgefuelltes Profil ist
 *    ausgefuellt. Dazu gehoeren auch die BESTANDS-Schwellen der Gemeinschaft
 *    („20 deiner Inhalte haben eine Stimme"): die Zahl waechst nur, sie faellt
 *    nie, und die naechste Stufe hat im Katalog schon ihren eigenen Namen
 *    (geschaetzt → anerkannt → bewundert). Ein zweites „Geschaetzt" waere
 *    dieselbe Auszeichnung fuer dieselbe Sache.
 *  - `'content'` — je INHALT, der ueber die Schwelle geht. Genau hier liegt das
 *    neue Ereignis: der zweite Beitrag mit 10 Stimmen ist ein zweiter Verdienst.
 *    Merkmal ist die Row-Id des Inhalts.
 *  - `'membershipYear'` — je MITGLIEDSJAHR. Merkmal ist die Jahres-Nummer.
 *
 * Das Merkmal (`qualifier`) steht an der verliehenen Zeile und macht die
 * Eindeutigkeit aus (Migration posts-015). Bestandszeilen tragen '' — beim
 * Jahrestag wird das als „Jahr 1" GELESEN, damit aus einer Umstellung keine
 * doppelte Verleihung wird.
 */

/**
 * Die Gruppen der Galerie. `trustLevel` steht ZULETZT (F1 Teilpaket 3), und das
 * ist Anzeige-Absicht: die drei davor sammelt man nebenbei, die Stufen sind der
 * Weg, der sich daraus ergibt.
 */
export const BADGE_GROUPS = ['gettingStarted', 'community', 'posting', 'trustLevel'] as const
export type BadgeGroup = (typeof BADGE_GROUPS)[number]

/**
 * WIE OFT ein Abzeichen kommen kann — und woran sich die Wiederholung
 * unterscheidet. Begruendung je Wert im Kopf dieser Datei.
 */
export const BADGE_AWARD_MODES = ['once', 'content', 'membershipYear'] as const
export type BadgeAwardMode = (typeof BADGE_AWARD_MODES)[number]

/**
 * Die FORM eines Inhalts, an dem eine Posting-Schwelle haengt.
 *
 * Bewusst hier und nicht aus dem Core-Vertrag importiert: `shared/` laeuft auch
 * im Browser, `registerContentUpvoteHandler` ist Server-Code. Ein Test nagelt
 * beide Listen aneinander, damit aus der Absicht kein Zufall wird.
 */
export type BadgeContentKind = 'topic' | 'reply'

/**
 * Das Merkmal einer EINMALIGEN Verleihung — und der Wert, den jede Bestandszeile
 * aus der Zeit vor posts-015 traegt.
 */
export const BADGE_QUALIFIER_NONE = ''

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
  /**
   * Mindest-VERTRAUENSSTUFE (F1 Teilpaket 3).
   *
   * DIE EINZIGE BEDINGUNG, DIE KEINE ZAHL AUS DIESEM LAYER IST, sondern ein
   * ERGEBNIS: die Stufe ist selbst schon aus Tagen, Inhalten und Stimmen
   * gerechnet (`shared/trustLevels.ts`). Sie hier auszuschreiben hiesse,
   * dieselben vier Schwellen ein zweites Mal zu pflegen — und die zweite Kopie
   * waere die, die beim naechsten Zahlen-Wechsel vergessen wird.
   *
   * Folge fuer die Fortschritts-Anzeige: sie ist hier bewusst STUMM
   * (`badgeProgress` kennt diese Bedingung nicht). Der Weg zur naechsten Stufe
   * ist keine Zahl, sondern vier — dafuer gibt es einen eigenen Abschnitt in
   * der Galerie, der jede einzeln nennt.
   */
  trustLevel?: number
}

export interface BadgeDefinition {
  key: string
  group: BadgeGroup
  /** Wie oft dieses Abzeichen kommen kann (Davids Mehrfach-Regel, s. Kopf). */
  awardedPer: BadgeAwardMode
  requires: BadgeRequirement
}

/**
 * Der Katalog. Die REIHENFOLGE ist die Anzeige-Reihenfolge: innerhalb einer
 * Gruppe vom leicht Erreichbaren zum Seltenen, damit die Galerie einen Weg
 * zeigt statt einer Wand.
 */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  // ── Der Anfang: vier erste Male ────────────────────────────────────────
  // Alle EINMALIG: ein Zustand (Profil) und drei erste Male. Ein zweites
  // „erstes Mal" gibt es nicht, und ein zweimal ausgefuelltes Profil auch nicht.
  { key: 'profile', group: 'gettingStarted', awardedPer: 'once', requires: { profileComplete: true } },
  { key: 'first-like', group: 'gettingStarted', awardedPer: 'once', requires: { likesGiven: 1 } },
  { key: 'first-flag', group: 'gettingStarted', awardedPer: 'once', requires: { flagsRaised: 1 } },
  /**
   * „Editor": einmal am eigenen Text nachgebessert.
   *
   * EINMALIG, obwohl `edits` weiterzaehlt — der Katalog sagt „ersten eigenen
   * Beitrag bearbeitet", und das ist ein ERSTES MAL wie die drei darueber.
   * Davids Mehrfach-Regel meint qualifizierende EREIGNISSE ueber einer
   * Schwelle, nicht ein erstes Mal, das es nur einmal geben kann.
   */
  { key: 'editor', group: 'gettingStarted', awardedPer: 'once', requires: { edits: 1 } },

  // ── Die Gemeinschaft: Zuspruch bekommen UND geben ─────────────────────
  // EINMALIG, und zwar alle: das sind BESTANDS-Schwellen ueber das ganze Konto
  // („20 deiner Inhalte haben eine Stimme"). Ein Bestand waechst nur — es gibt
  // kein zweites Ueberschreiten derselben Grenze, und die naechste Grenze hat
  // im Katalog schon ihren eigenen Namen.
  { key: 'welcome', group: 'community', awardedPer: 'once', requires: { likedItems: { threshold: 1, count: 1 } } },
  { key: 'appreciated', group: 'community', awardedPer: 'once', requires: { likedItems: { threshold: 1, count: 20 } } },
  { key: 'thank-you', group: 'community', awardedPer: 'once', requires: { likedItems: { threshold: 1, count: 20 }, likesGiven: 10 } },
  { key: 'gives-back', group: 'community', awardedPer: 'once', requires: { likedItems: { threshold: 1, count: 100 }, likesGiven: 100 } },
  { key: 'empathetic', group: 'community', awardedPer: 'once', requires: { likedItems: { threshold: 1, count: 500 }, likesGiven: 1000 } },
  { key: 'respected', group: 'community', awardedPer: 'once', requires: { likedItems: { threshold: 2, count: 100 } } },
  { key: 'admired', group: 'community', awardedPer: 'once', requires: { likedItems: { threshold: 5, count: 300 } } },

  /**
   * Der Jahrestag: dabei UND dabeigeblieben — JEDES JAHR NEU.
   *
   * BEIDE HAELFTEN, weil Davids Katalog beide nennt („1 Jahr Mitglied + ≥1
   * Beitrag in dem Jahr"). Ein Abzeichen nur fuer Zeitablauf waere kein
   * Verdienst, sondern ein Kalendereintrag — es bekaeme auch, wer sich vor
   * einem Jahr einmal umgesehen hat und nie wieder da war.
   *
   * MEHRJAEHRIG seit dem 2026-08-04: Mitgliedsjahr N ist verdient, wenn der
   * Beitritt mindestens N Jahre zurueckliegt UND IN JENEM JAHR etwas von diesem
   * Menschen entstanden ist. Das Fenster hat deshalb einen Anfang UND ein Ende
   * (`membershipYearWindow`) — mit einem blossen „seit" waere jedes alte Jahr
   * qualifiziert, sobald jemand heute etwas schreibt, und der Jahrestag hiesse
   * „irgendwann danach aktiv gewesen".
   *
   * `requires.recentContent` bleibt als DEKLARATION stehen: sie sagt, dass
   * dieses Abzeichen ein Jahresfenster braucht, und legt seine Laenge fest
   * (`badgeContentWindowDays()`). Gemessen wird sie fuer das juengste noch
   * offene Jahr — die uebrigen Jahre rechnet die Auswertestelle.
   */
  { key: 'anniversary', group: 'community', awardedPer: 'membershipYear', requires: { memberForDays: 365, recentContent: { withinDays: 365, count: 1 } } },

  // ── Das Schreiben: EIN Stueck, das eingeschlagen hat ──────────────────
  // JE INHALT (`content`): hier sitzt das neue qualifizierende Ereignis, das
  // Davids Regel meint. Der zweite Beitrag mit 10 Stimmen ist ein zweiter
  // Verdienst — Merkmal ist die Row-Id des Stuecks.
  { key: 'nice-topic', group: 'posting', awardedPer: 'content', requires: { likedTopics: { threshold: 10, count: 1 } } },
  { key: 'good-topic', group: 'posting', awardedPer: 'content', requires: { likedTopics: { threshold: 25, count: 1 } } },
  { key: 'great-topic', group: 'posting', awardedPer: 'content', requires: { likedTopics: { threshold: 50, count: 1 } } },
  { key: 'nice-reply', group: 'posting', awardedPer: 'content', requires: { likedReplies: { threshold: 10, count: 1 } } },
  { key: 'good-reply', group: 'posting', awardedPer: 'content', requires: { likedReplies: { threshold: 25, count: 1 } } },
  { key: 'great-reply', group: 'posting', awardedPer: 'content', requires: { likedReplies: { threshold: 50, count: 1 } } },

  // ── Die Vertrauensstufen (F1 Teilpaket 3) ────────────────────────────────
  /**
   * EINMALIG, und zwar alle vier — auch „Leader".
   *
   * Bei den Stufen 1–3 folgt das schon aus der Sache: es gibt keinen Abstieg,
   * also auch kein zweites Erreichen. Bei Stufe 4 ist es eine ENTSCHEIDUNG:
   * die Ernennung ist rücknehmbar, das Abzeichen nicht. „Verliehen ist
   * verliehen" — wer einmal Leader war, war es; ein Abzeichen, das beim Entzug
   * verschwindet und bei der nächsten Ernennung wiederkäme, wäre eine
   * Anzeige des heutigen Zustands und keine Auszeichnung. Den heutigen Zustand
   * zeigt der Stufen-Abschnitt der Galerie, und der ist ehrlich.
   */
  { key: 'trust-basic', group: 'trustLevel', awardedPer: 'once', requires: { trustLevel: 1 } },
  { key: 'trust-member', group: 'trustLevel', awardedPer: 'once', requires: { trustLevel: 2 } },
  { key: 'trust-regular', group: 'trustLevel', awardedPer: 'once', requires: { trustLevel: 3 } },
  { key: 'trust-leader', group: 'trustLevel', awardedPer: 'once', requires: { trustLevel: 4 } },
]

/** Der Katalog-Eintrag zu einem Schluessel — `null`, wenn es ihn nicht gibt. */
export function badgeDefinition(
  key: string,
  catalog: readonly BadgeDefinition[] = BADGE_CATALOG,
): BadgeDefinition | null {
  return catalog.find(badge => badge.key === key) ?? null
}

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
  /**
   * Die WIRKENDE Vertrauensstufe (F1 Teilpaket 3) — erarbeitet oder ernannt,
   * also `effectiveTrustLevel`, nicht die gespeicherte Zahl. 0 heisst „keine".
   */
  trustLevel: number
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
    trustLevel: 0,
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
 * unerreichbar wird. Mehrere VERSCHIEDENE Fensterlaengen gaebe es hier nicht
 * sinnvoll, deshalb gewinnt die GROESSTE: eine zu weite verleiht hoechstens ein
 * Abzeichen frueher, eine zu enge nie.
 *
 * SEIT DER MEHRFACH-VERLEIHUNG ist dieser Wert zugleich die LAENGE eines
 * Mitgliedsjahres (`membershipYearWindow`) — dass beide dieselbe Zahl sind, ist
 * kein Zufall: „ein Jahr dabei" und „im letzten Jahr geschrieben" reden vom
 * selben Jahr, und zwei Zahlen dafuer koennten auseinanderlaufen.
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
  // Die Stufe ist ein Bestand, kein Fenster: wer Stufe 3 hat, hat auch 1 und 2
  // verdient. Deshalb `>=` und nicht `===` — sonst bekaeme jemand, der von 0
  // direkt auf 2 springt (Bestandszeile beim ersten Hinsehen), das Abzeichen
  // fuer Stufe 1 nie.
  if (requires.trustLevel !== undefined && facts.trustLevel < requires.trustLevel) return false
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

/* ─── Mehrfach-Verleihung: die Merkmale (F1 Teilpaket 2) ─────────────────── */

/**
 * PURE: An welchem Inhalt haengt diese Posting-Schwelle? `null`, wenn das
 * Abzeichen keines ist.
 *
 * ABGELEITET aus der Bedingung statt danebengeschrieben — sonst koennten Regel
 * und Schwelle auseinanderlaufen. Gemeint ist genau die Bauart „EIN Stueck mit
 * mindestens so vielen Stimmen" (`count: 1`); eine Bedingung ueber MEHRERE
 * Stuecke ist eine Bestands-Schwelle und gehoert nicht an einen einzelnen
 * Inhalt.
 */
export function contentBadgeTrigger(
  badge: BadgeDefinition,
): { kind: BadgeContentKind, threshold: number } | null {
  if (badge.awardedPer !== 'content') return null
  if (badge.requires.likedTopics?.count === 1) return { kind: 'topic', threshold: badge.requires.likedTopics.threshold }
  if (badge.requires.likedReplies?.count === 1) return { kind: 'reply', threshold: badge.requires.likedReplies.threshold }
  return null
}

/**
 * PURE: Welche Abzeichen verdient ein Stueck dieser Form bei so vielen Stimmen?
 *
 * Ein BESTAND, keine Ueberschreitung: ein Beitrag mit 30 Stimmen verdient „gut"
 * UND „stark", auch wenn niemand hinsah, als er die 25 riss.
 */
export function contentBadgeKeysFor(
  kind: BadgeContentKind,
  upvotes: number,
  catalog: readonly BadgeDefinition[] = BADGE_CATALOG,
): string[] {
  const keys: string[] = []
  for (const badge of catalog) {
    const trigger = contentBadgeTrigger(badge)
    if (trigger && trigger.kind === kind && upvotes >= trigger.threshold) keys.push(badge.key)
  }
  return keys
}

/**
 * PURE: Was ist bei DIESER Stimme neu dazugekommen? (Bestand nachher minus
 * Bestand vorher.)
 *
 * WARUM DIE DIFFERENZ UND NICHT „ist die Schwelle erreicht": die Verleihung ist
 * ohnehin ueber den Unique-Index idempotent, aber ohne Differenz versuchte JEDE
 * weitere Stimme auf einem beliebten Beitrag bis zu drei Verleihungen, die alle
 * in einen 409 laufen — dauerhaft drei Schreibversuche je Stimme, fuer nichts.
 *
 * ROBUST GEGEN SPRUENGE, weil beide Seiten Staende sind und keine Gleichheit
 * geprueft wird: gehen zwei Stimmen gleichzeitig ein und die Neuzaehlung springt
 * von 9 auf 11, liegt die 10 in der Differenz und wird verliehen. Ein
 * `=== schwelle` haette sie lautlos verloren.
 */
export function contentBadgeCrossings(
  kind: BadgeContentKind,
  before: number,
  after: number,
  catalog: readonly BadgeDefinition[] = BADGE_CATALOG,
): string[] {
  const had = new Set(contentBadgeKeysFor(kind, before, catalog))
  return contentBadgeKeysFor(kind, after, catalog).filter(key => !had.has(key))
}

/**
 * PURE: Folgt die Bedingung ALLEIN aus den mitschreibenden Zaehlern?
 *
 * Nur dann darf die Zaehl-Buchung ein Abzeichen verleihen — sie kennt weder das
 * Profil noch die Meldungen noch die Verteilungs-Aggregate, und ein „vielleicht
 * erfuellt" waere ein Abzeichen zu viel. Heute trifft das auf `likesGiven` und
 * `edits` zu; kaeme ein Zaehler dazu, muss dieser Filter mitwachsen.
 */
export function badgeFollowsFromCounters(badge: BadgeDefinition): boolean {
  const { requires } = badge
  if (requires.likesGiven === undefined && requires.edits === undefined) return false
  return !requires.profileComplete
    && requires.flagsRaised === undefined
    && !requires.likedItems
    && !requires.likedTopics
    && !requires.likedReplies
    && requires.memberForDays === undefined
    && !requires.recentContent
    // Die Stufen-Abzeichen laufen ueber ihren EIGENEN Weg
    // (`trustLevelBadgeCrossings`): ihre Bedingung braucht das Beitrittsdatum,
    // das eine Zaehl-Buchung nicht kennt.
    && requires.trustLevel === undefined
}

/* ─── Die Vertrauensstufen (F1 Teilpaket 3) ──────────────────────────────── */

/**
 * PURE: Welche Abzeichen gehoeren zu diesem Stufen-Stand?
 *
 * Ein BESTAND wie bei den Inhalts-Abzeichen: Stufe 3 verdient „Basic", „Member"
 * UND „Regular". Wer beim ersten Hinsehen von 0 auf 2 springt (die Zaehler
 * standen laengst, nur die Stufe war nie gerechnet), bekommt beide — sonst
 * fiele die uebersprungene lautlos aus.
 */
export function trustLevelBadgeKeysFor(
  level: number,
  catalog: readonly BadgeDefinition[] = BADGE_CATALOG,
): string[] {
  return catalog
    .filter(badge => badge.requires.trustLevel !== undefined && level >= badge.requires.trustLevel)
    .map(badge => badge.key)
}

/**
 * PURE: Was ist bei DIESEM Aufstieg neu dazugekommen?
 *
 * Die Differenz aus demselben Grund wie ueberall sonst: ohne sie versuchte
 * JEDER Schreibvorgang eines langjaehrigen Mitglieds bis zu vier Verleihungen,
 * die alle in einen 409 laufen. Der Unique-Index bleibt trotzdem das Netz — die
 * Verleihung selbst ist blind.
 */
export function trustLevelBadgeCrossings(
  before: number,
  after: number,
  catalog: readonly BadgeDefinition[] = BADGE_CATALOG,
): string[] {
  const had = new Set(trustLevelBadgeKeysFor(before, catalog))
  return trustLevelBadgeKeysFor(after, catalog).filter(key => !had.has(key))
}

/** Die Staende, die eine Zaehl-Buchung kennt. */
export interface CounterBadgeFacts {
  likesGiven: number
  edits: number
}

/** PURE: Welche Abzeichen folgen bei diesem Stand allein aus den Zaehlern? */
export function counterBadgeKeysFor(
  values: CounterBadgeFacts,
  catalog: readonly BadgeDefinition[] = BADGE_CATALOG,
): string[] {
  return catalog
    .filter(badge => badgeFollowsFromCounters(badge)
      && (badge.requires.likesGiven === undefined || values.likesGiven >= badge.requires.likesGiven)
      && (badge.requires.edits === undefined || values.edits >= badge.requires.edits))
    .map(badge => badge.key)
}

/**
 * PURE: Was ist durch DIESE Buchung neu dazugekommen?
 *
 * Aus demselben Grund wie bei den Inhalten die Differenz und nicht der Bestand:
 * „Erster Zuspruch" ist ab der ersten vergebenen Stimme fuer immer erfuellt —
 * ohne Differenz liefe JEDE weitere Stimme in einen ueberfluessigen
 * Schreibversuch und dessen 409.
 */
export function counterBadgeCrossings(
  before: CounterBadgeFacts,
  after: CounterBadgeFacts,
  catalog: readonly BadgeDefinition[] = BADGE_CATALOG,
): string[] {
  const had = new Set(counterBadgeKeysFor(before, catalog))
  return counterBadgeKeysFor(after, catalog).filter(key => !had.has(key))
}

/* ─── Der Jahrestag, jaehrlich ────────────────────────────────────────────── */

/** PURE: Das Merkmal des Mitgliedsjahres N. */
export function membershipYearQualifier(year: number): string {
  return String(year)
}

/**
 * PURE: Das Merkmal einer VERLIEHENEN Jahrestag-Zeile, Bestand eingerechnet.
 *
 * Eine Zeile aus der Zeit vor posts-015 traegt '' — sie ist der erste Jahrestag
 * dieses Menschen und wird deshalb als Jahr 1 gelesen. Ohne diese Regel bekaeme
 * jeder Bestands-Traeger seinen ersten Jahrestag beim naechsten Hinsehen ein
 * zweites Mal.
 */
export function membershipYearOf(qualifier: string): string {
  return qualifier === BADGE_QUALIFIER_NONE ? membershipYearQualifier(1) : qualifier
}

/**
 * PURE: Die vollendeten Mitgliedsjahre (1, 2, 3 …) — leer, wenn die
 * Zugehoerigkeit unbekannt oder noch kein Jahr voll ist.
 *
 * UNBEKANNT ist NICHT null Tage (dieselbe Regel wie in `badgeEarned`): ohne
 * Naht zum Control Plane gibt es kein Beitrittsdatum, und dann bleibt der
 * Jahrestag unverdient statt falsch verliehen.
 */
export function completedMembershipYears(memberForDays: number | null, yearDays: number): number[] {
  if (memberForDays === null || yearDays <= 0) return []
  const years: number[] = []
  for (let year = 1; year * yearDays <= memberForDays; year++) years.push(year)
  return years
}

/**
 * PURE: Anfang (einschliesslich) und Ende (ausschliesslich) des Mitgliedsjahres
 * N — `null`, wenn das Beitrittsdatum unbrauchbar ist.
 *
 * Das Fenster liegt komplett in der VERGANGENHEIT (Jahr N ist vollendet, sonst
 * fragt niemand danach). Genau darum hat es ein Ende: „seit Beginn von Jahr 1"
 * wuerde jede spaetere Aktivitaet in Jahr 1 hineinrechnen.
 */
export function membershipYearWindow(
  joinedAt: string | null | undefined,
  year: number,
  yearDays: number,
): { since: string, until: string } | null {
  if (!joinedAt || year < 1 || yearDays <= 0) return null
  const joined = Date.parse(joinedAt)
  if (Number.isNaN(joined)) return null
  return {
    since: new Date(joined + (year - 1) * yearDays * DAY_MS).toISOString(),
    until: new Date(joined + year * yearDays * DAY_MS).toISOString(),
  }
}

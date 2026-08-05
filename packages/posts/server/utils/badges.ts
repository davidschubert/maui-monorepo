import { createHash } from 'node:crypto'
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { ContentUpvoteReport } from '../../../core/server/utils/contentUpvotes'
import {
  BADGE_QUALIFIER_NONE,
  type BadgeFacts,
  type CounterBadgeFacts,
  contentBadgeCrossings,
  counterBadgeCrossings,
  emptyBadgeFacts,
  trustLevelBadgeCrossings,
} from '../../shared/badges'
import type { MemberCounterValues } from '../../shared/memberCounters'
import { USER_BADGES_TABLE, type UserBadge } from '../../shared/types/post'

/**
 * VERLEIHUNG UND ZÄHLUNG (F1) — die Serverseite der Abzeichen.
 *
 * ── WANN WIRD VERLIEHEN? AN DREI STELLEN, UND DAS IST DER PUNKT ────────────
 * Bis Teilpaket 1 gab es genau eine: das Öffnen der Abzeichen-Seite. Das war
 * die Folge der Zählweise (Aggregate kennen keine Ereignisse) und hatte einen
 * Preis, der hier ausdrücklich stand — keine Benachrichtigung, denn „Du hast
 * ein Abzeichen erhalten", ausgelöst durch den Blick auf dasselbe, wäre
 * Theater gewesen.
 *
 * Seit Teilpaket 2 entsteht die Verleihung DORT, WO DAS EREIGNIS PASSIERT:
 *  1. **Die Stimm-Routen** kennen den neuen Stand EINES Stücks und verleihen
 *     die Posting-Abzeichen (`awardContentBadges`).
 *  2. **Die Zähl-Buchung** kennt den neuen Stand der mitschreibenden Zähler und
 *     verleiht, was allein daraus folgt (`awardCounterBadges`).
 *  3. **Das Hinsehen** bleibt als NETZ (`badges.get.ts`): für den Bestand, für
 *     alles, was Aggregate messen (Verteilungs-Schwellen), für den Jahrestag —
 *     und für jedes Ereignis, das unterwegs verloren ging. Verliehen ist
 *     verliehen, also benachrichtigt auch dieser Weg.
 *
 * ── DIE VERLEIHUNG IST KEIN SCHREIBVORGANG DES MITGLIEDS ──────────────────
 * `as: 'operator', actor: 'operator'` — und die zweite Hälfte ist die
 * wichtige. Mit `actor: 'member'` hätte das Ansehen der eigenen
 * Abzeichen-Seite zwei Nebenwirkungen, die beide falsch wären:
 *  - A5: der Betrachter würde durch einen SEITENAUFRUF Mitglied der Community.
 *    Genau das schließt A5 ausdrücklich aus („ein Seitenaufruf löst bewusst
 *    NICHTS aus") — sonst wäre jeder Vorbeisurfer Mitglied.
 *  - M13: in einer wegen Zahlung stillgelegten Community wäre die
 *    Abzeichen-Seite ein 403. Ein Abzeichen ist aber kein Inhalt, den jemand
 *    beisteuert; es ist eine Feststellung über Vergangenes.
 * Verliehen wird also vom System. Das Mitglied hat gehandelt, als es den
 * Beitrag schrieb — nicht, als es die Seite öffnete. An den beiden neuen
 * Stellen gilt dasselbe: wer eine Stimme BEKOMMT, hat nicht gehandelt.
 */

/** Der Link, den jede Abzeichen-Benachrichtigung trägt. */
const BADGE_GALLERY_LINK = '/discussions/badges'

/** Der i18n-Namensraum der Abzeichen-Texte (Glocke und Mail übersetzen ihn). */
const BADGE_TEXT_PREFIX = 'posts.discussions.badges'

export function badgeNameKey(badgeKey: string): string {
  return `${BADGE_TEXT_PREFIX}.name.${badgeKey}`
}

export function badgeCriterionKey(badgeKey: string): string {
  return `${BADGE_TEXT_PREFIX}.criterion.${badgeKey}`
}

/**
 * PURE: aus den Zählern die Zahlen machen, gegen die der Katalog prüft.
 *
 * Ein fehlender Zähler wird zu 0 und nicht zu „unbekannt". Das ist die
 * gutmütige Richtung: eine ausgefallene Quelle verzögert ein Abzeichen, sie
 * verleiht nie eines zu viel.
 *
 * DIE ZUGEHÖRIGKEIT KOMMT NICHT AUS DEN ZÄHLERN, sondern als eigenes Argument.
 * Sie ist keine Zahl, die dieser Mensch erarbeitet hat, sondern eine Auskunft
 * aus einem anderen Appwrite-PROJEKT (F1, `resolveJoinDates`) — und sie kennt
 * einen dritten Zustand, den ein Zähler nicht ausdrücken kann: `null` =
 * unbekannt, ausdrücklich nicht 0.
 *
 * `recentContent` ist seit der Mehrfach-Verleihung die Zahl aus dem JÜNGSTEN
 * abgefragten Mitgliedsjahr-Fenster; welche Jahre abgefragt wurden, entscheidet
 * die Auswertestelle (nur die noch unverliehenen).
 */
export function badgeFactsFrom(
  counters: Record<string, number>,
  thresholds: readonly number[],
  memberForDays: number | null = null,
  written: MemberCounterValues | null = null,
  recentContent = 0,
  trustLevel = 0,
): BadgeFacts {
  const facts = emptyBadgeFacts()
  facts.memberForDays = memberForDays
  facts.recentContent = recentContent
  /**
   * Die WIRKENDE Stufe (F1 Teilpaket 3) — wie die Zugehoerigkeit ein eigenes
   * Argument und keine Zahl aus den Zaehlern: sie ist selbst schon aus ihnen
   * gerechnet, und in ihr steckt zusaetzlich die Ernennung durch den Owner, von
   * der kein Zaehler etwas weiss.
   */
  facts.trustLevel = trustLevel
  facts.profileComplete = (counters[COUNTER_PROFILE_COMPLETE] ?? 0) >= 1
  /**
   * DIE MITSCHREIBENDEN ZÄHLER SIND DIE AUTORITÄT, WO SIE DIESELBE FRAGE
   * BEANTWORTEN (F1) — und das sind heute genau zwei:
   *
   *  - `likesGiven` ⇔ `upvotesGiven`: identische Frage, zwei Wege. Der Zähler
   *    gewinnt, weil er der Weg ist, den die späteren Teilpakete gehen (Trust
   *    Levels werten beim SCHREIBEN aus, wo acht `count`-Abfragen nicht
   *    bezahlbar sind). Damit die Umstellung nichts kostet, zieht die
   *    Auswertestelle einen zurückgefallenen Zähler vorher aufs Aggregat
   *    (`ensureSeededCounters` ⇒ `counterFellBehind`).
   *  - `edits`: kommt AUSSCHLIESSLICH von dort — eine Bearbeitung hinterlässt
   *    in den Inhalts-Tabellen keinen zählbaren Bestand.
   *
   * Die Schwellen-Zahlen (`likedItems` und Geschwister) bleiben Aggregat, und
   * das ist kein Übergangszustand: ein laufender Zähler kann „wie viele meiner
   * Beiträge haben ≥5 Stimmen" nicht beantworten, ohne je Schwelle einen
   * eigenen Stand zu führen und bei jeder Stimme zu wissen, welcher Beitrag
   * gerade welche Grenze überschritten hat.
   *
   * OHNE ZÄHLER-ZEILE (Silo ohne Discussions, Störung) fällt alles auf die
   * Aggregate zurück — `edits` ist dann 0, das Abzeichen „Editor" bleibt
   * unverdient. Nie ein Abzeichen zu viel, das ist die gutmütige Richtung.
   */
  facts.likesGiven = written?.upvotesGiven ?? counters[COUNTER_LIKES_GIVEN] ?? 0
  facts.edits = written?.edits ?? 0
  facts.flagsRaised = counters[COUNTER_FLAGS_RAISED] ?? 0
  for (const threshold of thresholds) {
    facts.likedItems[threshold] = counters[counterLikedItems(threshold)] ?? 0
    facts.likedTopics[threshold] = counters[counterLikedTopics(threshold)] ?? 0
    facts.likedReplies[threshold] = counters[counterLikedReplies(threshold)] ?? 0
  }
  return facts
}

/** Eine verliehene Zeile, so wie die Auswertung sie braucht. */
export interface AwardedBadge {
  badgeKey: string
  qualifier: string
  awardedAt: string
}

/**
 * Die schon verliehenen Abzeichen dieses Menschen.
 *
 * SEIT DER MEHRFACH-VERLEIHUNG eine LISTE statt einer Zuordnung: ein Abzeichen
 * kann mehrere Zeilen haben, und die Auswertung braucht die Merkmale, nicht nur
 * die Schlüssel.
 */
export async function awardedBadges(event: H3Event, userId: string): Promise<AwardedBadge[]> {
  const { rows } = await tenantDb(event).list<UserBadge>(USER_BADGES_TABLE, [
    Query.equal('userId', userId),
    // Großzügig über den Katalog hinaus: ein Abzeichen, das später aus dem
    // Katalog fällt, behält seine Zeile — sie darf die aktuellen nicht
    // aus der Seite drängen. Seit der Mehrfach-Verleihung ist die Grenze
    // zugleich eine Deckelung der Anzeige: wer 500 gefeierte Beiträge hat,
    // sieht „×100" statt einer zweiten Abfrage.
    Query.limit(100),
  ])
  return rows.map(row => ({
    badgeKey: row.badgeKey,
    qualifier: typeof row.qualifier === 'string' ? row.qualifier : BADGE_QUALIFIER_NONE,
    awardedAt: row.$createdAt,
  }))
}

/** Verliehene Zeilen nach Abzeichen gruppiert — die Merkmale je Schlüssel. */
export function qualifiersByBadge(awarded: readonly AwardedBadge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const row of awarded) {
    const set = map.get(row.badgeKey)
    if (set) set.add(row.qualifier)
    else map.set(row.badgeKey, new Set([row.qualifier]))
  }
  return map
}

/**
 * Der Idempotenz-Schlüssel der BENACHRICHTIGUNG zu einer Verleihung.
 *
 * Abgeleitet aus Community, Mensch, Abzeichen und Merkmal — damit derselbe
 * Verdienst höchstens EINE Glocken-Zeile und EINE Mail erzeugt, auch wenn zwei
 * Wege ihn gleichzeitig sehen (Stimm-Route und Netz). Gehasht, weil eine
 * Appwrite-Row-Id 36 Zeichen fasst und die vier Bestandteile zusammen deutlich
 * länger sind; der Präfix hält die Id vom Sonderzeichen am Anfang frei.
 *
 * Das ist der GÜRTEL, nicht der Hosenträger: die eigentliche Idempotenz macht
 * der Unique-Index auf `user_badges` — nur wer die Zeile wirklich angelegt hat,
 * benachrichtigt überhaupt.
 */
export function badgeNotificationId(communityId: string, userId: string, badgeKey: string, qualifier: string): string {
  const digest = createHash('sha256').update(`${communityId} ${userId} ${badgeKey} ${qualifier}`).digest('hex')
  return `bdg${digest.slice(0, 32)}`
}

/** Eine Verleihung, so wie die Aufrufer sie beschreiben. */
export interface BadgeAward {
  badgeKey: string
  qualifier: string
}

/**
 * Fehlende Abzeichen verleihen und den Verdienten benachrichtigen.
 * Antwort: die tatsächlich NEU entstandenen Zeilen.
 *
 * FAIL-SOFT je Abzeichen: schlägt eine Verleihung fehl, geht die Galerie
 * trotzdem auf, die Stimme wird trotzdem gezählt, und der nächste Aufruf holt
 * sie nach. Ein 409 ist kein Fehler, sondern die Antwort des Unique-Index auf
 * zwei gleichzeitige Aufrufe — dann hat das Abzeichen jemand anderes gerade
 * angelegt, und der hat auch benachrichtigt.
 *
 * KEIN „ERST NACHSEHEN, DANN SCHREIBEN": geschrieben wird blind. Zwischen
 * Nachsehen und Schreiben passt ein zweiter Aufruf, zwischen Schreiben und
 * seinem 409 nicht (dieselbe Idempotenz-Quelle wie bei den Migrationen).
 */
export async function grantBadges(
  event: H3Event,
  userId: string,
  awards: readonly BadgeAward[],
): Promise<AwardedBadge[]> {
  const granted: AwardedBadge[] = []
  if (awards.length === 0) return granted

  const db = tenantDb(event, { as: 'operator', actor: 'operator' })
  for (const award of awards) {
    try {
      const row = await db.create<UserBadge>(USER_BADGES_TABLE, {
        userId,
        badgeKey: award.badgeKey,
        qualifier: award.qualifier,
      }, {
        // Sichtbar für die Community, nicht nur für den Besitzer: ein Abzeichen
        // ist eine öffentliche Auszeichnung, und die Galerie neben einem Namen
        // ist die nächste Stufe. Schreibrechte bekommt niemand — verliehen
        // wird ausschließlich hier.
        read: 'members',
      })
      granted.push({ badgeKey: award.badgeKey, qualifier: award.qualifier, awardedAt: row.$createdAt })
      await notifyBadgeAwarded(event, userId, award)
    }
    catch (error) {
      // Der 409 wird NICHT protokolliert: er ist die erwartete Antwort und
      // nicht die Ausnahme. Seit die Verleihung an den Schreibwegen hängt,
      // treffen sich Stimm-Route und Netz regelmäßig auf demselben Verdienst —
      // eine Warnzeile je Fall machte aus einem gesunden Mechanismus einen
      // Dauerlärm, in dem die echten Fehlschläge untergingen.
      if (!isAlreadyAwarded(error)) {
        logEvent('warn', 'badges.grant_failed', {
          badgeKey: award.badgeKey,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return granted
}

/** „Dafür hat er es schon" — die Antwort des Unique-Index aus posts-015. */
function isAlreadyAwarded(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 409
}

/**
 * „Du hast ein Abzeichen bekommen." — Glocke und (bei Opt-in) Mail.
 *
 * `scope: 'tenant'` (C15): ein Abzeichen ist in EINER Community verdient und
 * gehört in deren Glocke. Wer in zwei Communities aktiv ist, sammelt dort
 * getrennt — deshalb steht der Mandant auch im Idempotenz-Schlüssel.
 *
 * TITEL UND TEXT SIND SCHLÜSSEL, KEINE SÄTZE. Der Name eines Abzeichens ist ein
 * Produktwort und wird an drei Stellen in womöglich drei Sprachen gelesen
 * (Glocke des Betrachters, Sofort-Mail, Digest-Mail nach `prefs.emailLocale`).
 * Ein fertiger Text wäre in zweien davon falsch; übersetzt wird beim LESEN
 * (Glocke: `displayText`, Mail: `resolveNotificationText`).
 *
 * `senderId` fehlt bewusst: verliehen hat das System, kein Mensch.
 */
async function notifyBadgeAwarded(event: H3Event, userId: string, award: BadgeAward): Promise<void> {
  // Nur der Pool hat einen Mandanten-Wert; im Silo ist die Instanz die
  // Community, und der leere Schlüsselteil unterscheidet dort nichts.
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  await notify(event, {
    recipientId: userId,
    type: 'badge.awarded',
    title: badgeNameKey(award.badgeKey),
    body: badgeCriterionKey(award.badgeKey),
    link: BADGE_GALLERY_LINK,
    scope: 'tenant',
    rowId: badgeNotificationId(communityId, userId, award.badgeKey, award.qualifier),
  })
}

/* ─── Weg 1: die Stimm-Routen (Posting-Abzeichen) ────────────────────────── */

/**
 * Ein Stueck hat Stimmen dazubekommen — verleihe, was dadurch neu faellig ist.
 * Der Empfaenger des Core-Vertrags `registerContentUpvoteHandler`.
 *
 * MERKMAL IST DIE ROW-ID DES INHALTS. Damit ist der zweite Beitrag mit zehn
 * Stimmen ein zweiter Verdienst und derselbe Beitrag mit der elften Stimme
 * keiner — genau die Unterscheidung, die Davids Mehrfach-Regel meint.
 */
export async function awardContentBadges(event: H3Event, report: ContentUpvoteReport): Promise<void> {
  const keys = contentBadgeCrossings(report.kind, report.previousUpvotes ?? 0, report.upvotes)
  if (keys.length === 0) return
  await grantBadges(event, report.authorId, keys.map(badgeKey => ({ badgeKey, qualifier: report.contentId })))
}

/* ─── Weg 2: die Zaehl-Buchung (was allein aus Zaehlern folgt) ───────────── */

/**
 * Nach dem Hochzaehlen: verleihe, was ALLEIN aus den mitschreibenden Zaehlern
 * folgt (heute „Erster Zuspruch" und „Nachgebessert").
 *
 * WARUM NUR DIESE: die Buchung kennt weder das Profil noch die Meldungen noch
 * die Verteilungs-Aggregate. Ein Abzeichen, das mehr verlangt, waere hier ein
 * Ratespiel — es bleibt dem Netz beim Hinsehen, das alles messen kann.
 *
 * VORHER GEGEN NACHHER, nicht „steht der Stand ueber der Schwelle": beide
 * Abzeichen haben Schwelle 1 und sind ab der ersten Stimme fuer immer erfuellt.
 * Ohne die Differenz waere jede weitere Stimme ein Schreibversuch, der im
 * Unique-Index endet — dauerhaft, fuer nichts. Die Verleihung selbst bleibt
 * trotzdem blind: der 409 ist das Netz, nicht die Regel.
 */
export async function awardCounterBadges(
  event: H3Event,
  userId: string,
  before: MemberCounterValues,
  after: MemberCounterValues,
): Promise<void> {
  const keys = counterBadgeCrossings(counterFactsOf(before), counterFactsOf(after))
  if (keys.length === 0) return
  await grantBadges(event, userId, keys.map(badgeKey => ({ badgeKey, qualifier: BADGE_QUALIFIER_NONE })))
}

/* ─── Weg 4: der Stufen-Aufstieg (F1 Teilpaket 3) ────────────────────────── */

/**
 * Eine Vertrauensstufe ist erreicht — verleihe, was dadurch neu faellig ist.
 *
 * VIERTE Verleihungsstelle, und sie musste eine eigene sein: die Bedingung der
 * Stufen-Abzeichen ist keine Zahl dieses Layers, sondern ein ERGEBNIS, in dem
 * das Beitrittsdatum aus dem Control Plane steckt. Die Zaehl-Buchung
 * (`awardCounterBadges`) kennt es nicht und darf es nicht raten; wer die Stufe
 * gerade ausgerechnet hat, kennt es.
 *
 * VORHER GEGEN NACHHER wie ueberall: ohne die Differenz versuchte jeder
 * Schreibvorgang eines langjaehrigen Mitglieds bis zu vier Verleihungen, die
 * alle in einen 409 laufen. Beim ENTZUG der Ernennung ist `after` kleiner als
 * `before`, die Differenz also leer — ein Abzeichen wird hier nie zurueckgenommen.
 */
export async function awardTrustLevelBadges(
  event: H3Event,
  userId: string,
  before: number,
  after: number,
): Promise<void> {
  const keys = trustLevelBadgeCrossings(before, after)
  if (keys.length === 0) return
  await grantBadges(event, userId, keys.map(badgeKey => ({ badgeKey, qualifier: BADGE_QUALIFIER_NONE })))
}

/**
 * Die EINE Namensbruecke zwischen Zaehler-Spalte und Katalog-Bedingung:
 * `upvotesGiven` heisst im Katalog `likesGiven` (Davids Entscheidung 4 —
 * „Like" IST die Aufstimme). Sie steht hier und nicht im Katalog, weil der
 * Katalog keine Spaltennamen kennen soll.
 */
function counterFactsOf(values: MemberCounterValues): CounterBadgeFacts {
  return { likesGiven: values.upvotesGiven, edits: values.edits }
}

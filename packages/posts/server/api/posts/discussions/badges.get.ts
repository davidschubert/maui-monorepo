import type { UserCounterWindow } from '../../../../../core/server/utils/userCounters'
import {
  BADGE_CATALOG,
  BADGE_QUALIFIER_NONE,
  type BadgeAwardMode,
  badgeContentWindowDays,
  badgeMemberDays,
  badgeThresholds,
  completedMembershipYears,
  earnedBadgeKeys,
  membershipDays,
  membershipYearOf,
  membershipYearQualifier,
  membershipYearWindow,
} from '../../../../shared/badges'
import { trustLevelProgress } from '../../../../shared/trustLevels'
import type { DiscussionBadge, DiscussionBadgesResponse } from '../../../../shared/types/post'
import type { BadgeAward } from '../../../utils/badges'

/**
 * Die Abzeichen-Galerie (F1 Stufe 4) — und das NETZ der Verleihung
 * (F1 Teilpaket 2).
 *
 * EIN AUFRUF, VIER SCHRITTE: nachsehen, was schon verliehen ist; zählen
 * (Core-Vertrag, alle Layer antworten); den Katalog dagegen prüfen (pur); das
 * Fehlende verleihen — mit Benachrichtigung.
 *
 * ── WARUM ES DIESEN WEG NOCH GIBT ─────────────────────────────────────────
 * Seit Teilpaket 2 entsteht die Verleihung dort, wo das Ereignis passiert (die
 * Stimm-Routen, die Zähl-Buchung). Dieser Weg ist der NACHZÜGLER: er holt den
 * BESTAND nach (Verdienste aus der Zeit vor der Umstellung), er beantwortet
 * alles, was nur ein Aggregat weiß (die Verteilungs-Schwellen „20 deiner
 * Inhalte haben eine Stimme"), er kennt als einziger die Zugehörigkeit — und er
 * fängt jedes Ereignis auf, das unterwegs verloren ging, weil alle Meldungen
 * fail-soft sind. Verliehen ist verliehen: auch dieser Weg benachrichtigt.
 *
 * GÄSTE BEKOMMEN DEN KATALOG, nicht eine 401. Die Galerie ist auch eine
 * Auskunft darüber, was es hier zu holen gibt; sie einem Unangemeldeten
 * vorzuenthalten hieße, Anmelden zur Bedingung fürs Nachlesen zu machen.
 * Gezählt und verliehen wird für ihn nichts — es gibt niemanden zu messen.
 *
 * ── DIE ZUGEHÖRIGKEIT (F1, seit 2026-08-04) ───────────────────────────────
 * „Seit wann ist dieser Mensch dabei?" beantwortet keine Zähl-Quelle, sondern
 * die Naht zum Control Plane (`resolveJoinDates`) — dort und nur dort steht
 * `community_members`. Fehlt sie (Silo-App, Kontroll-Host, CI-Build ohne
 * Control-Env), ist die Dauer `null`, und das Abzeichen „Jahrestag" bleibt
 * unverdient. Ein Fehler ist das nie: die übrigen 17 stehen unverändert da.
 *
 * ── DER JAHRESTAG KOMMT JÄHRLICH (F1 Teilpaket 2) ─────────────────────────
 * Gefragt wird NUR nach den Mitgliedsjahren, für die es noch kein Abzeichen
 * gibt: bei einem durchgehend aktiven Menschen ist das keines oder genau eines.
 * Ein Jahr, in dem er nichts geschrieben hat, bleibt offen und wird bei jedem
 * Blick in die Galerie erneut gezählt — das ist bewusst so, denn ein
 * nachträglich sichtbar gewordener Beitrag (Moderation nimmt eine Ausblendung
 * zurück) fällt in genau dieses Fenster. Der Preis ist eine `count`-Abfrage je
 * Quelle und Jahr, und nur auf dieser einen Seite.
 *
 * Jedes Jahr ist ein eigenes Fenster mit Anfang UND Ende: mit einem bloßen
 * „seit" wäre jedes alte Jahr qualifiziert, sobald jemand heute etwas schreibt.
 * Gezählt wird an der QUELLE, jeder Layer über seine eigenen Zeilen — sonst
 * zählte ein Abzeichen, das „Beitrag" sagt, die Antworten nicht mit.
 *
 * ── DIE MITSCHREIBENDEN ZÄHLER (F1) ───────────────────────────────────────
 * Neben den Aggregaten gibt es eine Zähler-Zeile je Mitglied
 * (`member_counters`). Sie ist die Autorität, wo sie dieselbe Frage beantwortet
 * (vergebene Stimmen), und die EINZIGE Quelle für das, was kein Aggregat
 * hergibt (Bearbeitungen). Sie entsteht beim ersten Hinsehen aus den Aggregaten
 * — ein Massen-Backfill über alle Instanzen und alle Mitglieder wäre ein
 * Projekt für sich und in dem Moment veraltet, in dem der nächste Mensch etwas
 * schreibt.
 */
export default defineEventHandler(async (event): Promise<DiscussionBadgesResponse> => {
  requirePlanProduct(event, 'posts')

  const emptyRow = (key: string, group: DiscussionBadge['group']): DiscussionBadge => ({
    key, group, earned: false, awardedAt: null, count: 0,
  })

  const user = event.context.user
  if (!user) {
    return {
      rows: BADGE_CATALOG.map(badge => emptyRow(badge.key, badge.group)),
      facts: null,
      trustLevel: 0,
      trustProgress: null,
    }
  }

  const thresholds = badgeThresholds()

  /**
   * ZUERST DAS SCHON VERLIEHENE, und das ist seit der Mehrfach-Verleihung keine
   * Reihenfolge-Kosmetik: erst daraus ergibt sich, nach welchen Jahresfenstern
   * überhaupt gefragt werden muss. Ein Jahr mit Abzeichen wird nie wieder
   * gezählt.
   */
  const awarded = await awardedBadges(event, user.$id)
  const qualifiers = qualifiersByBadge(awarded)

  const joinDates = await resolveJoinDates(event, [user.$id])
  const joinedAt = joinDates.get(user.$id) ?? null
  const memberForDays = membershipDays(joinedAt)

  const yearDays = badgeContentWindowDays()
  const requiredDays = badgeMemberDays()
  /**
   * Die offenen Mitgliedsjahre — vollendet, aber noch ohne Abzeichen. Die
   * Bestandszeile mit leerem Merkmal zählt dabei als Jahr 1 (`membershipYearOf`),
   * sonst käme der erste Jahrestag nach der Umstellung ein zweites Mal.
   */
  const awardedYears = new Set([...(qualifiers.get('anniversary') ?? [])].map(membershipYearOf))
  const openYears = yearDays !== null && requiredDays !== null
    ? completedMembershipYears(memberForDays, yearDays).filter(year => !awardedYears.has(membershipYearQualifier(year)))
    : []

  const windows: UserCounterWindow[] = []
  for (const year of openYears) {
    const window = yearDays === null ? null : membershipYearWindow(joinedAt, year, yearDays)
    if (window) windows.push({ key: membershipYearQualifier(year), ...window })
  }

  /**
   * Zuerst die Zähler-Zeile lesen, DANN zählen — nur so lässt sich entscheiden,
   * ob die zusätzlichen Seed-Abfragen überhaupt gebraucht werden. Sie kosten je
   * Quelle eine `count`-Abfrage und fallen genau EINMAL je Mensch an: beim
   * Eichen seiner Zeile.
   */
  const stored = await readMemberCounters(event, user.$id)
  const seed = needsCounterSeed(stored) ? true : undefined

  const counters = await collectUserCounters(event, {
    thresholds,
    ...(windows.length > 0 ? { windows } : {}),
    ...(seed ? { seed } : {}),
  })

  // Eichen, nachziehen oder unverändert lassen — und in jedem Fall den
  // gültigen Stand bekommen (die Regeln dahinter: shared/memberCounters.ts).
  const written = await ensureSeededCounters(event, user.$id, stored, {
    topicsCreated: counters[COUNTER_TOPICS_CREATED],
    repliesCreated: counters[COUNTER_REPLIES_CREATED],
    upvotesGiven: counters[COUNTER_LIKES_GIVEN],
  })

  // Für die Anzeige (und die Fortschritts-Regel) zählt das JÜNGSTE gefragte
  // Jahr — es ist das, an dem der nächste Jahrestag hängt.
  const newestYear = openYears.at(-1)
  const recentContent = newestYear === undefined ? 0 : counters[counterContentIn(membershipYearQualifier(newestYear))] ?? 0

  /**
   * DIE VERTRAUENSSTUFE, DAS NETZ (F1 Teilpaket 3).
   *
   * Der Aufstieg entsteht normalerweise beim SCHREIBEN — aber genau eine
   * Bedingung wächst ohne jedes Schreiben: die Zugehörigkeit. Wer alle Zahlen
   * erfüllt und nur noch auf den 60. Tag wartet, löst nichts aus, weil er
   * nichts tut. Sein Aufstieg kommt hier, beim nächsten Hinsehen — genau wie
   * beim Jahrestag und aus demselben Grund.
   *
   * Diese Stelle rechnet zusätzlich alles NACH, was unterwegs verloren gehen
   * konnte (alle Meldungen sind fail-soft), und sie hat das Beitrittsdatum
   * ohnehin schon in der Hand. Sie kostet hier also nichts extra.
   *
   * Die Zeile wird NEU gelesen: `ensureSeededCounters` hat sie womöglich gerade
   * geeicht, und mit den geeichten Zahlen springt ein Bestands-Mitglied sofort
   * auf seine Stufe.
   */
  const counterRow = await readMemberCounters(event, user.$id)
  const trustLevel = await refreshTrustLevel(event, user.$id, counterRow, memberForDays)

  const facts = badgeFactsFrom(counters, thresholds, memberForDays, written, recentContent, trustLevel)
  const trustProgress = trustLevelProgress(trustLevel, trustFactsFrom(counterRow, memberForDays))

  /**
   * WAS FEHLT NOCH? Je Verleihungs-Art eine eigene Frage — die Regel steht am
   * Katalog-Eintrag (`awardedPer`), nicht in verstreuten Abfragen.
   *
   * `once` UND `content` laufen hier gleich: das Netz kann nicht sagen, WELCHER
   * Beitrag die Schwelle gerissen hat (ein Aggregat zählt, es benennt nicht),
   * also verleiht es mit leerem Merkmal — und nur, solange es GAR KEINE Zeile
   * für dieses Abzeichen gibt. Damit holt das Netz das ERSTE Mal nach, und alle
   * weiteren Verleihungen kommen vom Schreibweg, der den Inhalt kennt. Ohne
   * diese Grenze bekäme jeder Bestands-Träger beim nächsten Blick eine zweite
   * Zeile für denselben Beitrag.
   */
  const missing: BadgeAward[] = []
  const earnedNow = new Set(earnedBadgeKeys(facts))
  for (const badge of BADGE_CATALOG) {
    const mode: BadgeAwardMode = badge.awardedPer
    if (mode === 'membershipYear') {
      for (const year of openYears) {
        const measured = counters[counterContentIn(membershipYearQualifier(year))] ?? 0
        if (measured >= (badge.requires.recentContent?.count ?? 1)) {
          missing.push({ badgeKey: badge.key, qualifier: membershipYearQualifier(year) })
        }
      }
      continue
    }
    if (!qualifiers.has(badge.key) && earnedNow.has(badge.key)) {
      missing.push({ badgeKey: badge.key, qualifier: BADGE_QUALIFIER_NONE })
    }
  }

  const rows = [...awarded, ...await grantBadges(event, user.$id, missing)]
  const byKey = new Map<string, { count: number, awardedAt: string }>()
  for (const row of rows) {
    const seen = byKey.get(row.badgeKey)
    if (seen) {
      seen.count += 1
      if (row.awardedAt > seen.awardedAt) seen.awardedAt = row.awardedAt
    }
    else byKey.set(row.badgeKey, { count: 1, awardedAt: row.awardedAt })
  }

  return {
    rows: BADGE_CATALOG.map((badge) => {
      const held = byKey.get(badge.key)
      return held
        ? { key: badge.key, group: badge.group, earned: true, awardedAt: held.awardedAt, count: held.count }
        : emptyRow(badge.key, badge.group)
    }),
    facts,
    trustLevel,
    trustProgress,
  }
})

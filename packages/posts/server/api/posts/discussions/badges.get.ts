import {
  BADGE_CATALOG,
  badgeContentWindowDays,
  badgeMemberDays,
  badgeThresholds,
  contentWindowStartIso,
  earnedBadgeKeys,
  membershipDays,
} from '../../../../shared/badges'
import type { DiscussionBadge, DiscussionBadgesResponse } from '../../../../shared/types/post'

/**
 * Die Abzeichen-Galerie (F1 Stufe 4, Konzept § 3.6 + Teil 4).
 *
 * EIN AUFRUF, DREI SCHRITTE: zählen (Core-Vertrag, alle Layer antworten),
 * den Katalog dagegen prüfen (pur), das Fehlende verleihen. Warum die
 * Verleihung an einem GET hängt und nicht an einem Lauf — und warum sie dabei
 * ausdrücklich NICHT als Handlung des Mitglieds gilt — steht im Kopf von
 * server/utils/badges.ts.
 *
 * GÄSTE BEKOMMEN DEN KATALOG, nicht eine 401. Die Galerie ist auch eine
 * Auskunft darüber, was es hier zu holen gibt; sie einem Unangemeldeten
 * vorzuenthalten hieße, Anmelden zur Bedingung fürs Nachlesen zu machen.
 * Gezählt und verliehen wird für ihn nichts — es gibt niemanden zu messen.
 *
 * ── DIE ZUGEHÖRIGKEIT IST DER VIERTE SCHRITT (F1, seit 2026-08-04) ─────────
 * „Seit wann ist dieser Mensch dabei?" beantwortet keine Zähl-Quelle, sondern
 * die Naht zum Control Plane (`resolveJoinDates`) — dort und nur dort steht
 * `community_members`. Fehlt sie (Silo-App, Kontroll-Host, CI-Build ohne
 * Control-Env), ist die Dauer `null`, und das Abzeichen „Jahrestag" bleibt
 * unverdient. Ein Fehler ist das nie: die übrigen 16 stehen unverändert da.
 *
 * DAS ZEITFENSTER WIRD NUR ANGEFRAGT, WENN ES ETWAS ENTSCHEIDEN KANN. Die
 * zusätzliche `count`-Abfrage je Quelle („habe ich im letzten Jahr etwas
 * geschrieben?") kostet nur, wer die Zugehörigkeit schon erfüllt — für alle
 * anderen wäre ihre Antwort ohnehin folgenlos, weil beide Hälften gelten
 * müssen. Das ist die billigste ehrliche Datumsprüfung, die dieser Bestand
 * hergibt: gezählt wird an der QUELLE, jeder Layer über seine eigenen Zeilen.
 *
 * ── DIE MITSCHREIBENDEN ZÄHLER SIND DER FÜNFTE SCHRITT (F1, 2026-08-04) ────
 * Seit dem gemeinsamen Paket (Konzept Teil 5, Punkte 4–6) gibt es NEBEN den
 * Aggregaten eine Zähler-Zeile je Mitglied (`member_counters`). Sie ist die
 * Autorität, wo sie dieselbe Frage beantwortet (vergebene Stimmen), und die
 * EINZIGE Quelle für das, was kein Aggregat hergibt (Bearbeitungen). Sie
 * entsteht beim ersten Hinsehen aus den Aggregaten — ein Massen-Backfill über
 * alle Instanzen und alle Mitglieder wäre ein Projekt für sich und in dem
 * Moment veraltet, in dem der nächste Mensch etwas schreibt.
 */
export default defineEventHandler(async (event): Promise<DiscussionBadgesResponse> => {
  requirePlanProduct(event, 'posts')

  const catalogRow = (key: string, group: DiscussionBadge['group'], awardedAt: string | null): DiscussionBadge => ({
    key, group, earned: awardedAt !== null, awardedAt,
  })

  const user = event.context.user
  if (!user) {
    return { rows: BADGE_CATALOG.map(badge => catalogRow(badge.key, badge.group, null)), facts: null }
  }

  const thresholds = badgeThresholds()

  const joinDates = await resolveJoinDates(event, [user.$id])
  const memberForDays = membershipDays(joinDates.get(user.$id))

  const windowDays = badgeContentWindowDays()
  const requiredDays = badgeMemberDays()
  const since = windowDays !== null
    && requiredDays !== null
    && memberForDays !== null
    && memberForDays >= requiredDays
    ? contentWindowStartIso(windowDays)
    : undefined

  /**
   * ── DER FÜNFTE SCHRITT: DIE MITSCHREIBENDEN ZÄHLER (F1) ──────────────────
   * Zuerst die Zeile lesen, DANN zählen — nur so lässt sich entscheiden, ob
   * die zusätzlichen Seed-Abfragen überhaupt gebraucht werden. Sie kosten je
   * Quelle eine `count`-Abfrage und fallen genau EINMAL je Mensch an: beim
   * Eichen seiner Zeile. Wer seine Galerie zum zweiten Mal öffnet, bezahlt
   * genau so viel wie vorher.
   */
  const stored = await readMemberCounters(event, user.$id)
  const seed = needsCounterSeed(stored) ? true : undefined

  const counters = await collectUserCounters(event, {
    thresholds,
    ...(since ? { since } : {}),
    ...(seed ? { seed } : {}),
  })

  // Eichen, nachziehen oder unverändert lassen — und in jedem Fall den
  // gültigen Stand bekommen (die Regeln dahinter: shared/memberCounters.ts).
  const written = await ensureSeededCounters(event, user.$id, stored, {
    topicsCreated: counters[COUNTER_TOPICS_CREATED],
    repliesCreated: counters[COUNTER_REPLIES_CREATED],
    upvotesGiven: counters[COUNTER_LIKES_GIVEN],
  })

  const facts = badgeFactsFrom(counters, thresholds, memberForDays, written)

  const known = await awardedBadges(event, user.$id)
  const missing = earnedBadgeKeys(facts).filter(key => !known.has(key))
  for (const [key, awardedAt] of await grantBadges(event, user.$id, missing)) {
    known.set(key, awardedAt)
  }

  return {
    rows: BADGE_CATALOG.map(badge => catalogRow(badge.key, badge.group, known.get(badge.key) ?? null)),
    facts,
  }
})

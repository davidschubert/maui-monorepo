import { Query } from 'node-appwrite'
import { effectiveTrustLevel } from '../../../../shared/trustLevels'
import { MEMBER_COUNTERS_TABLE, type MemberCounters, type TrustLevelMember, type TrustLevelMembersResponse } from '../../../../shared/types/post'

/**
 * Die Stufen-Verwaltung des Owners (F1 Teilpaket 3): wer ist Leader, und wen
 * könnte man ernennen?
 *
 * ── WARUM DIE LISTE AUS `member_counters` KOMMT UND NICHT AUS DER
 *    MITGLIEDERLISTE ───────────────────────────────────────────────────────
 * Die Mitgliederliste gehört dem onboarding-Layer (`/api/community/members/*`,
 * Service-Naht ins Control Plane). Sie von hier zu benutzen wäre eine neue
 * Abhängigkeit posts → onboarding, und der posts-Layer läuft auch in Apps ohne
 * onboarding (Silo) — die Seite ginge dort ins Leere.
 *
 * Sie wäre aber auch INHALTLICH falsch: ernannt werden kann nur, wer hier schon
 * etwas getan hat, denn nur dann gibt es eine Zeile mit Zählern. Eine
 * Vertrauensstufe für jemanden zu vergeben, der in dieser Community noch nie
 * geschrieben hat, wäre eine Aussage ohne Grundlage. Die Zähler-Tabelle IST
 * also die richtige Grundgesamtheit, nicht der billigere Ersatz.
 *
 * ── ZWEI ABFRAGEN, ZWEI VERSCHIEDENE FRAGEN ───────────────────────────────
 *  1. „Wer ist Leader?" — exakt und vollständig über `idx_community_leader`
 *     (posts-016). Sie sind wenige, und der Owner muss sie ALLE sehen: eine
 *     Liste, die einen Ernannten verschweigt, ist schlimmer als keine.
 *  2. „Wen könnte ich ernennen?" — die zuletzt aktiven, gedeckelt. Nach
 *     `trustLevel` zu sortieren wäre die schönere Reihenfolge und bräuchte
 *     einen weiteren Index für eine Seite, die ein Owner selten öffnet;
 *     `$updatedAt` hat seinen Index von Appwrite und beantwortet „wer war
 *     zuletzt hier" — für die Suche nach einer bestimmten Person die
 *     brauchbarere Ordnung. Was nicht hineinpasst, sagt `truncated`.
 */

/** Wie viele Mitglieder die Seite zeigt, bevor sie „mehr" meldet. */
const PAGE_LIMIT = 100

export default defineEventHandler(async (event): Promise<TrustLevelMembersResponse> => {
  requirePlanProduct(event, 'posts')
  await requireCommunityPermission(event, 'posts.appoint')

  // Operator-Klinke wie überall bei diesen Zeilen: sie tragen keine
  // Client-Rechte. `actor: 'operator'` — Nachsehen ist kein Inhalt (M13) und
  // kein Beitritt (A5).
  const db = tenantDb(event, { as: 'operator', actor: 'operator' })

  const [leaderRows, memberRows] = await Promise.all([
    db.list<MemberCounters>(MEMBER_COUNTERS_TABLE, [
      Query.equal('trustLevelLeader', true),
      Query.limit(PAGE_LIMIT),
    ]),
    db.list<MemberCounters>(MEMBER_COUNTERS_TABLE, [
      Query.orderDesc('$updatedAt'),
      // Einer mehr als angezeigt: nur so lässt sich „es gibt noch mehr" sagen,
      // ohne eine zweite Abfrage zu bezahlen.
      Query.limit(PAGE_LIMIT + 1),
    ]),
  ])

  const shown = memberRows.rows.slice(0, PAGE_LIMIT)
  // Die Namen für BEIDE Listen in EINEM gebündelten Aufruf (Muster
  // resolveAvatars/team.get.ts) — ein Lookup je Zeile wäre ein N+1 über bis zu
  // 200 Konten.
  const names = await resolveUserNames(event, [
    ...leaderRows.rows.map(row => row.userId),
    ...shown.map(row => row.userId),
  ])

  function toMember(row: MemberCounters): TrustLevelMember {
    const leader = row.trustLevelLeader === true
    return {
      userId: row.userId,
      name: names.get(row.userId) ?? '',
      level: effectiveTrustLevel(row.trustLevel, leader),
      // Die erarbeitete Stufe steht daneben, damit der Owner SIEHT, worauf ein
      // Entzug zurückfällt — sonst wäre „Leader entziehen" ein Sprung ins
      // Ungewisse.
      earnedLevel: effectiveTrustLevel(row.trustLevel, false),
      leader,
      contentCreated: (row.topicsCreated ?? 0) + (row.repliesCreated ?? 0),
      upvotesGiven: row.upvotesGiven ?? 0,
      upvotesReceived: row.upvotesReceived ?? 0,
      updatedAt: row.$updatedAt,
    }
  }

  return {
    leaders: leaderRows.rows.map(toMember),
    members: shown.map(toMember),
    truncated: memberRows.rows.length > PAGE_LIMIT,
  }
})

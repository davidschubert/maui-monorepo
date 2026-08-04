import { BADGE_CATALOG, badgeThresholds, earnedBadgeKeys } from '../../../../shared/badges'
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
  const counters = await collectUserCounters(event, { thresholds })
  const facts = badgeFactsFrom(counters, thresholds)

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

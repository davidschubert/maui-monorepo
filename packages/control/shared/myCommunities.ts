import { COMMUNITY_ROLES, communityRoleHasCapability, type CommunityRole } from '../../core/shared/communityAuthz'
import { normalizeTenantPlan, type TenantPlan } from './types/tenantRecord'

/**
 * „Deine Communities" — der Vertrag der Kunden-Übersicht auf `my.pukalani.app`
 * (F12). PURE, unit-getestet, ohne h3/Appwrite: das Control Plane setzt ihn
 * durch, der onboarding-Layer konsumiert ihn, die Seite rendert ihn.
 *
 * WAS HIER DRINSTEHT UND WARUM NICHT MEHR: die Antwort verlässt das Control
 * Plane und landet in einem Browser. Sie trägt deshalb nur, was die Übersicht
 * ANZEIGT — kein `stripeCustomerId`, keine `stripeSubscriptionId`, kein
 * `projectId`, kein `tenantId`, kein `profile`. Was eine Seite nicht braucht,
 * gehört nicht in ihren Payload.
 *
 * DIE TESTPHASE IST NICHT FÜR ALLE (M13-Grenze weitergedacht): „diese Community
 * testet noch" ist eine Aussage über den VERTRAGSZUSTAND, und die geht
 * Mitleser nichts an — `GET /api/community/billing/trial` verlangt aus genau
 * diesem Grund `community.billing`. Also trägt auch diese Liste `trialEndsAt`
 * NUR für Mitgliedschaften, deren Rolle diese Capability hat (heute: owner).
 * Ein Viewer sieht Name, Adresse und seine Rolle — sonst nichts.
 *
 * DER PLAN DAGEGEN SCHON: er steht ohnehin im SSR-Payload JEDER Community-Seite
 * (tenant-brand.server.ts spiegelt `tenants.plan` nach `pukalani-tenant-plan`,
 * damit `planAllows()` Produkte ausblenden kann) — ihn hier zu verschweigen
 * wäre eine Geheimhaltung, die einen Klick weiter nicht existiert.
 */

/** Was die Übersicht über EINE Mitgliedschaft zeigt. */
export interface MyCommunityView {
  /** = communities.$id */
  communityId: string
  name: string
  /** Kanonischer Host — das Klickziel und zugleich die zweite Zeile der Karte. */
  host: string
  /** Die eigene Rolle IN dieser Community. */
  role: CommunityRole
  plan: TenantPlan
  /**
   * ISO-Datum oder null. `null` heißt ZWEIERLEI und das ist hier unschädlich:
   * „keine Testphase" oder „diese Rolle darf es nicht wissen" — beide Male
   * zeigt die Karte keinen Testphasen-Hinweis.
   */
  trialEndsAt: string | null
}

/** Rohdaten EINER Mitgliedschaft, wie das Control Plane sie zusammenträgt. */
export interface MyCommunityFacts {
  communityId: string
  name: string
  host: string
  role: CommunityRole
  /** Status der COMMUNITY (nicht der Mitgliedschaft). */
  communityStatus: string
  /** `communities.plan`; '' = Bestand vor control-013. */
  plan: string | null
  trialEndsAt: string | null
}

/**
 * Obergrenze der Abfrage. Eigene Communities sind auf 3 gedeckelt
 * (SITE_LIMIT_AFTER_TRIAL), MITGLIED kann jemand in beliebig vielen sein —
 * deshalb großzügig, aber endlich: eine Übersicht ohne `limit` ist der Anfang
 * einer Seite, die eines Tages hunderte Karten rendert.
 */
export const MY_COMMUNITIES_LIMIT = 50

/** Rang der Rolle (owner zuerst) — COMMUNITY_ROLES ist absteigend sortiert. */
function roleRank(role: CommunityRole): number {
  return COMMUNITY_ROLES.indexOf(role)
}

/**
 * Fakten → Ansicht. Drei Entscheidungen, alle hier und nirgends sonst:
 *
 *  1. **Stillgelegte Communities fallen weg.** `status !== 'active'` heißt, der
 *     Host antwortet 404 (der Mandanten-Resolver liefert null) — eine Karte,
 *     die ins Leere führt, ist schlechter als keine. „Stilllegen" IST der
 *     Löschweg (C16), das Verschwinden aus der Liste ist die erwartete Folge.
 *  2. **Testphase nur für den, der zahlt** (s. Kopf).
 *  3. **Sortierung: eigene zuerst.** Owner vor Admin vor … vor Viewer, bei
 *     gleicher Rolle alphabetisch. Wer drei eigene Communities und zwanzig
 *     Mitgliedschaften hat, soll seine oben finden — nicht raten müssen,
 *     wonach sortiert wurde.
 */
export function projectMyCommunities(facts: readonly MyCommunityFacts[]): MyCommunityView[] {
  return facts
    .filter(row => row.communityStatus === 'active')
    .map(row => ({
      communityId: row.communityId,
      name: row.name,
      host: row.host,
      role: row.role,
      plan: normalizeTenantPlan(row.plan),
      trialEndsAt: communityRoleHasCapability(row.role, 'community.billing') ? row.trialEndsAt ?? null : null,
    }))
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name))
}

/** Antwort-Umschlag der Route (und damit auch der Runtime-Route darüber). */
export interface MyCommunitiesResponse {
  communities: MyCommunityView[]
}

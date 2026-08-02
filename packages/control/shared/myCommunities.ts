import { COMMUNITY_ROLES, communityRoleHasCapability, type CommunityRole } from '../../core/shared/communityAuthz'
import { communityIsReadOnly, resolveCommunitySuspension, type CommunitySuspension } from '../../core/shared/communitySuspension'
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
  /**
   * WARUM gesperrt (M13). `''` = alles normal · `'billing'` = nur-lesend,
   * die Adresse funktioniert weiter · `'abuse'` = Host offline, die Karte führt
   * NIRGENDWO hin (s. `projectMyCommunities`).
   *
   * Für Rollen ohne `community.billing` steht hier IMMER `''` — aus demselben
   * Grund wie bei `trialEndsAt`: der GRUND einer Sperre ist eine Aussage über
   * den Vertrag, und die geht Mitleser nichts an. Was sie sehr wohl angeht,
   * steht daneben in `readOnly`.
   */
  suspension: CommunitySuspension
  /**
   * DASS gesperrt — für JEDE Rolle (Befund 2 des Wechselwirkungs-Audits).
   *
   * Vorher gab es nur `suspension`, und die war für Mitleser leer: ein Viewer
   * sah eine vollkommen normale Karte, klickte hinein und lief in eine
   * Community, in der jeder Schreibversuch abgewiesen wird. Das ist keine
   * Geheimhaltung mehr, sondern eine Falle — „du kannst hier gerade nichts
   * beitragen" ist eine Tatsache ÜBER DIE COMMUNITY, die jeder erlebt, sobald
   * er es versucht.
   *
   * Die Grenze verläuft also zwischen DASS und WARUM, nicht zwischen Rollen:
   * `readOnly` trägt jede Karte, `suspension` nur die des Abrechnenden. Dass
   * für Mitleser abuse-gesperrte Communities ohnehin ausgefiltert werden,
   * heißt zugleich: für sie kann `readOnly` nur aus einer billing-Sperre
   * kommen — und der Vorwurf „Missbrauch" wird nie sichtbar, auch nicht
   * indirekt.
   */
  readOnly: boolean
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
  /** `communities.suspension` roh; `null` = Bestand vor control-034. */
  suspension: string | null
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
 * Fakten → Ansicht. Fünf Entscheidungen, alle hier und nirgends sonst:
 *
 *  1. **Stillgelegte Communities fallen weg.** `status !== 'active'` heißt, der
 *     Host antwortet 404 (der Mandanten-Resolver liefert null) — eine Karte,
 *     die ins Leere führt, ist schlechter als keine. „Stilllegen" IST der
 *     Löschweg (C16), das Verschwinden aus der Liste ist die erwartete Folge.
 *  2. **GESPERRTE bleiben dagegen stehen** (M13). Genau hier trennen sich
 *     `status` und `suspension`: eine Sperre ist kein Löschen, und der Owner
 *     muss beides können — erfahren, warum seine Adresse tot ist, und bezahlen.
 *     Verschwände die Karte, wäre die Zahlungssperre eine Sackgasse.
 *  3. **Eine abuse-gesperrte Community sieht NUR, wer abrechnet** (heute: der
 *     Owner). Zwei Gründe: der Host ist offline, für alle anderen ist die
 *     Community schlicht weg — dieselbe Erfahrung wie bei jeder anderen
 *     abgeschalteten Adresse. Und „diese Community wurde wegen Missbrauchs
 *     gesperrt" ist ein Vorwurf; den bekommt der zu lesen, an den er gerichtet
 *     ist, nicht seine zwanzig Mitglieder. Eine billing-Sperre bleibt für alle
 *     in der Liste, weil der Host ja weiterläuft — nur der GRUND ist gegated.
 *  4. **Testphase nur für den, der zahlt** (s. Kopf) — und aus demselben Grund
 *     der GRUND der Sperre (`suspension`). Die TATSACHE dagegen (`readOnly`)
 *     trägt jede Karte: bis zum Wechselwirkungs-Audit versprach Punkt 3 „nur
 *     der GRUND ist gegated", und der Code blankte trotzdem beides — ein
 *     Viewer sah eine ganz normale Karte in eine Community, in der er nichts
 *     mehr schreiben kann. Jetzt gilt das Versprechen wörtlich.
 *  5. **Sortierung: eigene zuerst.** Owner vor Admin vor … vor Viewer, bei
 *     gleicher Rolle alphabetisch. Wer drei eigene Communities und zwanzig
 *     Mitgliedschaften hat, soll seine oben finden — nicht raten müssen,
 *     wonach sortiert wurde.
 */
export function projectMyCommunities(facts: readonly MyCommunityFacts[]): MyCommunityView[] {
  return facts
    .filter(row => row.communityStatus === 'active')
    .filter(row => resolveCommunitySuspension(row.suspension) !== 'abuse'
      || communityRoleHasCapability(row.role, 'community.billing'))
    .map((row) => {
      const suspension = resolveCommunitySuspension(row.suspension)
      const billing = communityRoleHasCapability(row.role, 'community.billing')
      return {
        communityId: row.communityId,
        name: row.name,
        host: row.host,
        role: row.role,
        plan: normalizeTenantPlan(row.plan),
        trialEndsAt: billing ? row.trialEndsAt ?? null : null,
        // WARUM: nur für den Abrechnenden. DASS: für alle.
        suspension: billing ? suspension : '',
        readOnly: communityIsReadOnly(suspension),
      }
    })
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name))
}

/** Antwort-Umschlag der Route (und damit auch der Runtime-Route darüber). */
export interface MyCommunitiesResponse {
  communities: MyCommunityView[]
}

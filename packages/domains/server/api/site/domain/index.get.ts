import { readSiteDomainState } from '../../../utils/siteDomain'

/**
 * Stand der eigenen Domain dieser Silo-Site lesen (control-036).
 *
 * ── WARUM `community.domain` UND KEINE NEUE CAPABILITY ────────────────────
 * Weil es dieselbe Befugnis ist: „darf die Adresse dieser Site bestimmen".
 * Der Schlüssel heißt seit control-035 so, und sein Kommentar in
 * `core/shared/authz.ts` nennt diesen Fall wörtlich — eine Silo-App hat gar
 * keine Community-Rollen, dort trägt der Betreiber-Admin die Einstellung über
 * sein globales Label. Dasselbe Muster wie `community.embed` und
 * `community.analytics`.
 *
 * `requireCommunityPermission` ist auch im Silo richtig und nicht nur
 * geduldet: ohne Mandanten-Kontext fällt es auf genau diese Label-Prüfung
 * zurück (`tenantScoped = false`). Eine zweite, silo-eigene Prüfung wäre eine
 * zweite Stelle, an der jemand später eine Rolle vergisst.
 */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.domain')
  return await readSiteDomainState(event)
})

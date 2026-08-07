import { removeSiteDomain } from '../../../utils/siteDomain'

/**
 * Die eigene Domain wieder abgeben (control-036).
 *
 * Reihenfolge und Fail-soft-Verhalten stehen in `removeSiteDomain()`: erst die
 * Wahrheit (die Zeile im Control Plane), dann das Aufräumen — ploi-Aliasse
 * räumt das Control Plane ab, die Appwrite-Web-Platforms diese App.
 *
 * ACHTUNG BEIM AUFRUF: sobald die Domain aktiv war, ist SIE die kanonische
 * Adresse — dieses DELETE über die alte Pukalani-Adresse zu schicken, endet in
 * einem 308 auf die Kundendomain (dieselbe Beobachtung wie im Pool, Abschnitt
 * 10 des dortigen Beweises). Das Dashboard läuft ohnehin auf der kanonischen
 * Adresse; für Skripte ist es eine Falle und deshalb hier notiert.
 */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.domain')
  return await removeSiteDomain(event)
})

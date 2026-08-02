import { runPastDueSweep } from '../../../utils/pastDueSweep'

/**
 * Zahlungsverzugs-Sweep manuell auslösen (Ops/Verifikation) — der
 * Intervall-Plugin läuft stündlich, diese Route erlaubt „jetzt prüfen" ohne
 * Warten. Gleiches Muster wie `POST /api/notifications/run-digest`.
 *
 * Sie ist nicht nur Bequemlichkeit: ohne sie ließe sich die 14-Tage-Automatik
 * nur beweisen, indem man eine Stunde wartet — und ein Beweis, den niemand
 * abwartet, wird nicht geführt.
 *
 * `sites.manage`-gated (Betreiber). Idempotent wie der Sweep selbst: er sperrt
 * jede Community höchstens einmal und hebt auf, was nicht mehr überfällig ist.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  return await runPastDueSweep()
})

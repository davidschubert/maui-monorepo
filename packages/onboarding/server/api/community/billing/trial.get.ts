/**
 * M13 — das Ende der Testphase, für den EINEN, der etwas tun kann.
 *
 * Antwort: `{ trialEndsAt: string | null }` — das ISO-Datum aus der
 * `communities`-Row, roh. Die Regel, ab wann daraus ein Hinweis wird, steht pur
 * in `packages/control/shared/onboarding.ts` (`trialNotice`); diese Route
 * entscheidet nichts, sie gibt eine Tatsache heraus.
 *
 * KEIN RUF INS CONTROL PLANE: der Wert steckt schon im aufgelösten
 * Mandanten-Kontext (tenantsResolver liest die Row ohnehin, 30 s gecacht). Ein
 * eigener Service-Call pro Dashboard-Aufruf wäre ein HTTP-Hop für ein Datum,
 * das bereits im Speicher liegt.
 *
 * WARUM GEGATED, wo es doch nur ein Datum ist: „diese Community testet noch"
 * bzw. „ihre Testphase ist ausgelaufen" ist eine Aussage über den
 * Vertragszustand des Kunden, und die geht Mitleser nichts an. Deshalb dieselbe
 * Capability wie die Abo-Seite — `community.billing` trägt nur der Owner
 * (Davids Entscheidung 2 vom 2026-07-30).
 *
 * 404 ohne Pool-Mandanten: auf einem Kontroll-Host, im Silo und im Einzelbetrieb
 * gibt es keine Testphase — dieselbe Antwort wie eine Route, die es nicht gibt.
 */
export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.billing')

  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  return { trialEndsAt: tenant.trialEndsAt ?? null }
})

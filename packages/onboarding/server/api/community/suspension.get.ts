/**
 * M13 — „Deine Community ist gesperrt", für den EINEN, der etwas tun kann.
 *
 * Antwort: `{ suspension, reason }`. Die Regel, ob daraus ein Hinweis wird,
 * ist trivial (`suspension !== ''`) und steht deshalb nicht extra als pure
 * Funktion daneben — anders als bei der Testphase, wo eine Tagesrechnung
 * dahintersteckt.
 *
 * KEIN RUF INS CONTROL PLANE: der Zustand steckt schon im aufgelösten
 * Mandanten-Kontext (der Resolver liest die Row ohnehin, 30 s gecacht). Der
 * GRUND aber nicht — der reist bewusst NICHT im Kontext mit, weil er auf jeder
 * öffentlichen Seite mitliefe und jedem Gast erzählte, dass diese Community
 * ihre Rechnung nicht bezahlt hat. Er kommt deshalb hier über einen einzelnen,
 * gegateten Service-Ruf.
 *
 * DIESELBE CAPABILITY WIE DIE ABO-SEITE (`community.billing`, nur der Owner,
 * Davids Entscheidung 2 vom 2026-07-30): „diese Community ist wegen offener
 * Zahlung nur-lesend" ist eine Aussage über den Vertragszustand des Kunden.
 * Ein Moderator merkt am zugegangenen Schreiben ohnehin, dass etwas ist; WARUM,
 * geht ihn nichts an.
 *
 * PRAKTISCH KANN NUR 'billing' HERAUSKOMMEN: eine abuse-gesperrte Community
 * löst ihren Host gar nicht mehr auf — diese Route existiert dort nicht.
 *
 * 404 ohne Pool-Mandanten (Kontroll-Host, Silo, Einzelbetrieb): dort gibt es
 * keinen Vertrag, den man sperren könnte.
 */
import { callControlPlane } from '../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../utils/communityTeamGate'

export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'community.billing')

  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const suspension = tenant.suspension ?? ''
  // Nicht gesperrt ist der Normalfall — und dafür gibt es keinen Grund zu
  // holen. Ein Service-Ruf (samt frisch geprägtem JWT) auf JEDEM
  // Dashboard-Aufruf wäre ein Appwrite-Roundtrip für eine leere Antwort.
  if (!suspension) return { suspension: '', reason: '' }

  // Erst jetzt der teure Weg: dieselbe Naht wie bei Branding/Registrierung —
  // Service-Secret + JWT des Handelnden, und das Control Plane prüft die Rolle
  // ein zweites Mal selbst.
  const gate = await requireCommunityTeamGate(event, 'community.billing')
  const { reason } = await callControlPlane<{ reason: string }>(
    event, '/api/control/community/suspension', { jwt: gate.jwt, communityId: gate.communityId },
  )
  return { suspension, reason }
})

import { projectCommunitySwitcher, type CommunitySwitcherResponse } from '../../../shared/communitySwitcher'
import { listMyCommunities } from '../../utils/communityHandoff'

/**
 * DIE LISTE FÜR DEN COMMUNITY-SWITCHER im Dashboard-Kopf (F50, 2026-08-07).
 *
 * Gegenstück zu `GET /api/onboarding/communities`, aber am ANDEREN Ort und mit
 * engerer Auswahl: der Kundenbereich auf `my.*` zeigt jede Mitgliedschaft, das
 * Dashboard-Menü nur die, in denen es etwas zu verwalten gibt (Team-Rollen —
 * die Begründung steht bei `projectCommunitySwitcher`).
 *
 * ── NUR AUF POOL-MANDANTEN-HOSTS (404 sonst) ──────────────────────────────
 * Drei Orte, drei Antworten, und keiner davon braucht diese Route:
 *  - KONTROLL-HOST (`my.*`, `start.*`): dort steht die vollständige Übersicht
 *    schon als eigene Seite. Zusätzlich fiele die Route ohnehin durch das
 *    fail-closed Präfix-Tor (`/api/community/` steht nicht in
 *    `controlApiPrefixes`) — dieses `mode !== 'pool'` ist die zweite Hälfte,
 *    denn eine Seite zu verstecken sperrt keine Route.
 *  - SILO (`mode: 'silo'`): eine Instanz, eine Community. Es gibt nichts zu
 *    wechseln, und die Naht ins Control Plane ist dort nicht verdrahtet.
 *  - KEIN MANDANT (Playground, Einzelbetrieb): dasselbe.
 *
 * ── KEINE EIGENE DATENTÜR NÖTIG ───────────────────────────────────────────
 * Diese Route berührt KEINE Tabelle des Runtime-Projekts. Sie beweist die
 * Session, mintet ein kurzlebiges JWT und lässt das Control Plane antworten,
 * das seinerseits nur nach der Identität aus genau diesem JWT sucht — die
 * Auswahl hängt am Nutzer, nicht am Host. Es gibt hier also nichts zu scopen;
 * dasselbe gilt für die Geschwister unter `/api/onboarding/`.
 */
export default defineEventHandler(async (event): Promise<CommunitySwitcherResponse> => {
  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const communities = await listMyCommunities(event)
  return { communities: projectCommunitySwitcher(communities, tenant.communityId ?? '') }
})

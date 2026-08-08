import { z } from 'zod'
import { isSwitcherTeamRole } from '../../../shared/communitySwitcher'
import { sealCommunityHandoff, type SealedCommunityHandoff } from '../../utils/communityHandoff'

/**
 * DER SPRUNG IN EINE ANDERE COMMUNITY — aus dem Dashboard heraus (F50,
 * 2026-08-07).
 *
 * Siegelt die laufende Session für den Ziel-Host, genau wie
 * `POST /api/onboarding/handoff` es für den Kundenbereich tut; der gesamte
 * Sicherheitskern liegt in der geteilten `sealCommunityHandoff()` (Ziel-Host
 * aus der Mitgliedschaftsliste, Siegel an ihn gebunden — Audit 2026-08-02).
 *
 * ZWEI UNTERSCHIEDE ZUM KUNDENBEREICH, beide bewusst:
 *  1. **Der Ort.** Diese Route lebt auf den MANDANTEN-Hosts (`/api/community/`),
 *     nicht auf den Kontroll-Hosts — dasselbe Gate wie bei
 *     `switcher.get.ts` (nur `mode: 'pool'`), damit ein Silo oder ein
 *     Kontroll-Host hier nichts findet.
 *  2. **Die Auswahl.** Nur TEAM-Rollen. Die Bedingung ist dieselbe wie die des
 *     Menüs, das den Klick auslöst — sonst wäre die Liste eine Empfehlung und
 *     die Route eine offene Tür daneben. Sie kann die Mitgliedschaftsprüfung
 *     nur VERSCHÄRFEN: `sealCommunityHandoff` verlangt die Mitgliedschaft
 *     ohnehin, dieser Filter kommt danach.
 */
const bodySchema = z.object({
  /** Für WELCHE Community gesiegelt wird — Pflicht, denn daraus kommt das Ziel. */
  communityId: z.string().trim().min(1).max(36),
}).strict()

export default defineEventHandler(async (event): Promise<SealedCommunityHandoff> => {
  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  return await sealCommunityHandoff(event, body.communityId, community => isSwitcherTeamRole(community.role))
})

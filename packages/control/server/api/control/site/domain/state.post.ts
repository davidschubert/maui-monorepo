import { z } from 'zod'
import { siteDomainStateFor } from '../../../../utils/siteDomainService'
import { requireSiteDomainCaller } from '../../../../utils/siteDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * Den Stand der eigenen Domain LESEN — mit Token und Anleitung (control-036).
 *
 * POST, obwohl es ein Lesevorgang ist: das JWT des Nutzers reist im RUMPF,
 * nicht in der URL. Ein Token im Query-String landet in nginx-Logs, in
 * Verlaufslisten und in Referrern. (Gleiche Begründung wie bei der
 * Community-Fassung.)
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  projectId: z.string().min(1).max(64),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { row } = await requireSiteDomainCaller(event, body)
  return siteDomainStateFor(event, row)
})

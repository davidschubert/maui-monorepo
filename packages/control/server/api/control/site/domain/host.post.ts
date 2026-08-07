import { z } from 'zod'
import { siteDomainAddressFor } from '../../../../utils/siteDomainService'
import { findWebsiteByProject } from '../../../../utils/siteDomainGate'
import { requireOnboardingCaller } from '../../../../utils/onboardingService'

/**
 * „WELCHE ADRESSE IST MEINE?" — die eine Frage, die eine Silo-App bei JEDEM
 * Request beantwortet haben muss (control-036).
 *
 * ── WARUM SIE EINE EIGENE ROUTE HAT UND NICHT `state` MITBENUTZT ──────────
 * Wegen des PUBLIKUMS. Die Middleware läuft vor jedem Request, auch für Gäste
 * und Bots; und der Rückruf der Betreiber-Konsole (`/api/site/domain/settle`)
 * hat überhaupt keinen Menschen dahinter. In beiden Fällen gibt es kein
 * Nutzer-JWT, das man mitschicken könnte — diese Route verlangt deshalb nur
 * das Service-Secret.
 *
 * Und weil sie das tut, enthält sie ausschließlich ÖFFENTLICHE Tatsachen:
 * Hostnamen und die Stufe, in der sie stecken. Beides steht ohnehin im DNS und
 * in jedem Zertifikatsprotokoll. Das Verifikations-TOKEN bleibt in `state`,
 * hinter dem JWT — hätte man beides in eine Route gelegt, wäre es über das
 * Service-Secret allein erreichbar gewesen, und mit ihm könnte ein zweites
 * Deployment den Eigentums-Nachweis einer fremden Domain führen. Der
 * Fehlertext bleibt aus demselben Grund draußen: er zitiert ploi.
 *
 * ── UNBEKANNTE PROJEKT-ID IST KEIN FEHLER ─────────────────────────────────
 * Sie antwortet mit einer LEEREN Adresse und 200, nicht mit 404. Eine
 * Silo-App, die (noch) nicht im Register steht, soll normal laufen — ohne
 * kanonischen Host gibt es schlicht keine Umleitung. Ein 404 hier würde die
 * Middleware bei jedem Request in einen Fehlerpfad schicken.
 */
const bodySchema = z.object({
  projectId: z.string().min(1).max(64),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const { row } = await findWebsiteByProject(event, body.projectId)
  if (!row) return { canonicalHost: '', fallbackHost: '', knownHosts: [], domain: '', status: 'none', forms: [] }
  return siteDomainAddressFor(row)
})

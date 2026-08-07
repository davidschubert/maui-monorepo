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
 * und Bots — es gibt dort kein Nutzer-JWT, das man mitschicken könnte. Diese
 * Route verlangt deshalb nur das Service-Secret.
 *
 * Und weil sie das tut, darf sie NICHTS Vertrauliches enthalten. Zurück gehen
 * genau drei Dinge: der kanonische Host, der Rückfall-Host und die Liste der
 * eigenen Hosts. Alles davon steht ohnehin im DNS und in jedem öffentlichen
 * Zertifikatsprotokoll. Das Verifikations-TOKEN, der Fehlertext und die
 * DNS-Anleitung bleiben in `state` — dort, wo ein JWT die Tür bewacht.
 *
 * Hätte man beides in eine Route gelegt, wäre das Token über das
 * Service-Secret allein erreichbar gewesen, und mit ihm könnte ein zweites
 * Deployment den Eigentums-Nachweis einer fremden Domain führen.
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
  if (!row) return { canonicalHost: '', fallbackHost: '', knownHosts: [] }
  return siteDomainAddressFor(row)
})

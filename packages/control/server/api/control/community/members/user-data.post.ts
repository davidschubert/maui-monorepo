import { z } from 'zod'
import { exportCommunityUserData } from '../../../../utils/communityErasure'

/**
 * DSGVO-AUSKUNFT über die Naht (F3): die Runtime orchestriert den Export ihres
 * Nutzers, seine Mitgliedschaften und Einladungen liegen aber hier.
 *
 * KEIN JWT — dieselbe Begründung wie bei der Feedback-Auskunft und bei
 * `user-erase`: die Auskunft wird auch für Konten verlangt, die sich nicht mehr
 * anmelden können (Betreiber-Anfrage, Snapshot direkt vor der Löschung). Der
 * Gate ist das Service-Secret; gescopt wird hart auf das Tripel
 * (runtimeProjectId, runtimeUserId, email), das der Aufrufer für SICH nennt.
 *
 * DAS PROJEKT WIRD GEPRÜFT, NICHT GEGLAUBT (Nacht-Audit 2026-08-02, F33 — der
 * Befund nannte `user-erase`, diese Route hatte dieselbe Lücke in Lese-
 * richtung): `assertOnboardingRuntimeProject` hält das genannte Projekt gegen
 * das EINE, das diese Naht bedient. Eine Auskunft über die Mitgliedschaften und
 * Einladungsadressen eines FREMDEN Runtime-Projekts ist auch ohne Schreibrecht
 * ein Datenleck.
 *
 * Die E-Mail ist optional, weil sie nur für die Einladungen gebraucht wird —
 * die sind ausschließlich über die Adresse auffindbar. Der Aufrufer schickt sie
 * nur, wenn sie BESTÄTIGT ist (siehe communityUserData.ts im onboarding-Layer).
 */
const bodySchema = z.object({
  runtimeProjectId: z.string().min(1).max(36),
  runtimeUserId: z.string().min(1).max(36),
  email: z.string().email().max(254).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const runtimeProjectId = assertOnboardingRuntimeProject(event, body.runtimeProjectId)
  return await exportCommunityUserData(event, runtimeProjectId, body.runtimeUserId, body.email ?? '')
})

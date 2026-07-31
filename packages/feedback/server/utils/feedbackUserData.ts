import type { H3Event } from 'h3'
import { FEEDBACK_SERVICE_PATHS } from '../../../control/shared/customerFeedback'
import { callFeedbackService, feedbackServiceReachable } from './feedbackGateway'

/**
 * DSGVO-Beitrag des feedback-Layers.
 *
 * Der Layer besitzt seit E10 KEINE eigene Tabelle mehr — die Zeilen liegen im
 * Control Plane. Der Contributor bleibt trotzdem hier, und zwar zwingend:
 * „ein Layer mit Nutzerdaten muss einen registerUserDataContributor
 * mitbringen" (CLAUDE.md; im Plan als Folge von Entscheidung 4 ausdrücklich
 * benannt). Er reicht Auskunft und Löschung über dieselbe Naht weiter, über
 * die auch alles andere läuft.
 *
 * GESCOPT wird auf das Paar (eigenes Appwrite-Projekt, userId): dieselbe
 * User-Id in zwei Projekten sind zwei verschiedene Menschen, und diese App
 * darf nur ihre eigenen Leute anfassen.
 *
 * EXPORT degradiert (fehlt control, fehlt der Abschnitt — eine Auskunft ohne
 * einen Teil ist besser als gar keine). LÖSCHUNG NICHT: `deleteUserCompletely`
 * gated `users.delete` auf Voll-Erfolg, und eine stillschweigend
 * übersprungene Löschung wäre genau der Fehler, den dieses Gate verhindern
 * soll. Ist die Naht nicht erreichbar, scheitert sie laut.
 */

function runtimeProjectId(event: H3Event): string {
  return useRuntimeConfig(event).public.appwriteProjectId
}

export async function feedbackExportUserData(event: H3Event, userId: string) {
  if (!feedbackServiceReachable(event)) return {}
  return await callFeedbackService<Record<string, unknown>>(event, FEEDBACK_SERVICE_PATHS.userData, {
    projectId: runtimeProjectId(event),
    userId,
  }).catch(() => ({}))
}

export async function feedbackDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  return await callFeedbackService<UserDataDeleteResult>(event, FEEDBACK_SERVICE_PATHS.userErase, {
    projectId: runtimeProjectId(event),
    userId,
  })
}

import { z } from 'zod'
import { eraseCommunityUserData } from '../../../../utils/communityErasure'

/**
 * DSGVO-LÖSCHUNG über die Naht (F3): alle Mitgliedschaften dieses Runtime-Users
 * auflösen, die Einladungen an seine Adresse und seine Early-Access-Anfragen
 * entfernen und seine Spuren in fremden Einladungen kappen.
 *
 * KEIN JWT, und das ist hier keine Bequemlichkeit: der Aufruf kommt aus
 * `deleteUserCompletely`, wo das Konto gerade gesperrt wird und gleich
 * verschwindet — bei einem Re-Run nach Teilfehler oder einem Betreiber-Auftrag
 * kann es schon weg sein. Ein JWT zu verlangen hieße, die Löschung genau dann zu
 * verweigern, wenn sie am nötigsten ist. Der Gate ist das Service-Secret; die
 * Identität ist das Paar (runtimeProjectId, runtimeUserId), das der Aufrufer für
 * SICH nennt, und alles wird hart darauf gescopt.
 *
 * DAS PROJEKT WIRD GEPRÜFT, NICHT GEGLAUBT (Nacht-Audit 2026-08-02, F33):
 * `assertOnboardingRuntimeProject` hält das genannte Projekt gegen das EINE,
 * das diese Naht bedient. Vorher hätte das Service-Secret gereicht, um
 * Mitgliedschaften in einem FREMDEN Runtime-Projekt zu löschen. Begründung an
 * der Helferfunktion.
 *
 * PROTOKOLLIERT, weil das eine schreibende Fremd-Operation ist — und weil die
 * zurückgehaltenen Zeilen („letzter Owner", siehe decideMembershipErasure) im
 * KLARTEXT irgendwo landen müssen: der Betreiber muss wissen, welche Community
 * jetzt einen verwaisten Owner-Platz hat. In der ANTWORT reisen sie ebenfalls
 * mit, aber der Aufrufer ist unser eigenes Deployment und legt sie ins Log —
 * ein Browser sieht diese Liste nie (sie nennt fremde Communities).
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

  const result = await eraseCommunityUserData(event, runtimeProjectId, body.runtimeUserId, body.email ?? '')

  logEvent('info', 'community.user_erased', {
    runtimeProjectId,
    runtimeUserId: body.runtimeUserId,
    deleted: result.deleted,
    anonymized: result.anonymized,
    invitesDeleted: result.invitesDeleted,
    invitesAnonymized: result.invitesAnonymized,
    inviteRequestsDeleted: result.inviteRequestsDeleted,
    retained: result.retained.map(entry => `${entry.communityName} (${entry.role}, ${entry.reason})`).join(', '),
  })

  return result
})

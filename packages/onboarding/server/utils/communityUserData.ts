import type { H3Event } from 'h3'
import type { CommunityErasureResult, CommunityUserDataExport } from '../../../control/shared/communityTeam'
import { callControlPlane } from './controlPlane'

/**
 * F3 — DSGVO-Beitrag des onboarding-Layers.
 *
 * DER BEFUND: `deleteUserCompletely` räumt das Appwrite-Projekt der RUNTIME ab.
 * Die Mitgliedschaften einer Person (`community_members`) und die Einladungen an
 * ihre Adresse (`community_invites`) liegen aber im CONTROL PLANE — einem
 * anderen Projekt, auf das die Runtime nur einen read-only-Key hat. Vor F3
 * blieben sie deshalb stehen: eine tote `runtimeUserId` in jeder Mitgliedschaft,
 * und — der eigentliche Punkt — die E-Mail-Adresse der gelöschten Person
 * unbefristet in jeder Einladung.
 *
 * WARUM DER CONTRIBUTOR IN DIESEM LAYER LEBT: „ein Layer mit Nutzerdaten muss
 * einen registerUserDataContributor mitbringen" (CLAUDE.md) — und die Naht zum
 * Control Plane gehört diesem Layer (A14, dieselbe Regel wie beim
 * Beitritts-Handler in server/plugins/community-join.ts). Der feedback-Layer
 * macht es seit E10 genauso: kein eigenes Schema, trotzdem ein Contributor,
 * weil die DATEN existieren.
 *
 * Und genau deshalb steht er NICHT im core: eine Silo-App ohne onboarding hat
 * keine Mitgliedschaften — dort ist das Projekt die Grenze, es gibt nichts
 * aufzuräumen. Ohne den Layer fehlt der Contributor, und die Registry ist
 * automatisch korrekt besetzt.
 *
 * EXPORT DEGRADIERT, LÖSCHUNG NICHT (Muster feedbackUserData.ts): eine Auskunft
 * ohne einen Abschnitt ist besser als gar keine; eine stillschweigend
 * übersprungene Löschung wäre dagegen genau der Fehler, den das
 * Voll-Erfolgs-Gate von `deleteUserCompletely` verhindern soll. Ist die Naht
 * nicht erreichbar, scheitert sie laut — der Account bleibt gesperrt stehen und
 * ein Re-Run räumt den Rest ab.
 */

const USER_DATA_PATH = '/api/control/community/members/user-data'
const USER_ERASE_PATH = '/api/control/community/members/user-erase'

/**
 * Wer wird hier gelöscht — und unter welcher Adresse?
 *
 * Das Control Plane bekommt die Identität als Paar (Projekt + User), nicht als
 * JWT: zum Zeitpunkt des Aufrufs ist das Konto gesperrt und verschwindet gleich,
 * bei einem Re-Run existiert es womöglich nicht mehr. Die Begründung steht an
 * der Route.
 *
 * Die ADRESSE geht nur mit, wenn sie BESTÄTIGT ist. Eine unbestätigte Adresse
 * gehört nachweislich niemandem — mit ihr Einladungen zu löschen hieße, auf
 * fremde Zeilen zu zeigen, weil jemand sie einmal eingetippt hat. Fehlt die
 * Adresse, bleiben die Einladungen unangetastet; sie verfallen ohnehin nach 7
 * Tagen und tragen ohne Empfänger keinen Zugang mehr.
 */
async function erasureIdentity(event: H3Event, userId: string): Promise<{
  runtimeProjectId: string
  runtimeUserId: string
  email?: string
}> {
  const runtimeProjectId = useRuntimeConfig(event).public.appwriteProjectId
  // 404 = Konto schon weg (Orphan-Cleanup-Modus des Orchestrators) → ohne
  // Adresse weitermachen, die Mitgliedschaften findet das Paar auch so.
  const user = await createAdminClient(event).users.get({ userId }).catch(() => null)
  const email = user?.emailVerification && user.email ? user.email : ''

  return { runtimeProjectId, runtimeUserId: userId, ...(email ? { email } : {}) }
}

export async function communityExportUserData(event: H3Event, userId: string): Promise<CommunityUserDataExport | Record<string, never>> {
  if (!controlServiceAvailable(event)) return {}
  const identity = await erasureIdentity(event, userId)
  return await callControlPlane<CommunityUserDataExport>(event, USER_DATA_PATH, identity).catch(() => ({}))
}

export async function communityDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const identity = await erasureIdentity(event, userId)
  const result = await callControlPlane<CommunityErasureResult>(event, USER_ERASE_PATH, identity)

  // „Letzter Owner": die Zeile MUSSTE bleiben (sonst stünde die Community ohne
  // jemanden da, der übertragen oder abrechnen kann) und wurde nur
  // entpersonalisiert. Das darf nicht still passieren — der Betreiber muss
  // wissen, welche Community jetzt einen verwaisten Owner-Platz hat.
  if (result.retained.length > 0) {
    logEvent('warn', 'gdpr.community_owner_retained', {
      userId,
      communities: result.retained.map(entry => `${entry.communityName} (${entry.communityId})`).join(', '),
    })
  }

  // Einladungen zählen als gelöschte Zeilen — sie sind es.
  return { deleted: result.deleted + result.invitesDeleted, anonymized: result.anonymized }
}

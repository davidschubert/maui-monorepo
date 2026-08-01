import { communityDeleteUserData, communityExportUserData } from '../utils/communityUserData'

/**
 * Registriert den GDPR-Contributor des onboarding-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 *
 * Der Layer besitzt keine eigene Tabelle: seine Nutzerdaten (Mitgliedschaften,
 * Einladungen) liegen im Control Plane und werden über die Naht dieses Layers
 * geräumt. Warum der Contributor trotzdem — und genau — hier steht, erklärt
 * server/utils/communityUserData.ts.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'onboarding',
    exportUserData: communityExportUserData,
    deleteUserData: communityDeleteUserData,
  })
})

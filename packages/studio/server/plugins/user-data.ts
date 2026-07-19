/**
 * Registriert den GDPR-Contributor des studio-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 * M9-T1: Workspace-Mitgliedschaften + angenommene Einladungen.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'studio',
    exportUserData: studioExportUserData,
    deleteUserData: studioDeleteUserData,
  })
})

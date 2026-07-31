/**
 * Registriert den GDPR-Contributor des control-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 * M9-T1: Workspace-Mitgliedschaften + angenommene Einladungen.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'control',
    exportUserData: controlExportUserData,
    deleteUserData: controlDeleteUserData,
  })
})

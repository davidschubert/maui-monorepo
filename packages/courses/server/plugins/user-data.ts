/**
 * Registriert den GDPR-Contributor des courses-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'courses',
    exportUserData: coursesExportUserData,
    deleteUserData: coursesDeleteUserData,
  })
})

/**
 * Registriert den GDPR-Contributor des events-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'events',
    exportUserData: eventsExportUserData,
    deleteUserData: eventsDeleteUserData,
  })
})

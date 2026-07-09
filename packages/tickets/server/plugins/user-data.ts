/**
 * Registriert den GDPR-Contributor des tickets-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'tickets',
    exportUserData: ticketsExportUserData,
    deleteUserData: ticketsDeleteUserData,
  })
})

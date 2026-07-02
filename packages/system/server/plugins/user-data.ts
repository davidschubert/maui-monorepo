/**
 * Registriert den GDPR-Contributor des system-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'system',
    exportUserData: systemExportUserData,
    deleteUserData: systemDeleteUserData,
  })
})

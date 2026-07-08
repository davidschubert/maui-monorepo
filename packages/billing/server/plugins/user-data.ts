/**
 * Registriert den GDPR-Contributor des billing-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'billing',
    exportUserData: billingExportUserData,
    deleteUserData: billingDeleteUserData,
  })
})

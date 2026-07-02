/**
 * Registriert den GDPR-Contributor des moderation-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'moderation',
    exportUserData: moderationExportUserData,
    deleteUserData: moderationDeleteUserData,
  })
})

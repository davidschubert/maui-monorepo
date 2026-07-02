/**
 * Registriert den GDPR-Contributor des comments-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'comments',
    exportUserData: commentsExportUserData,
    deleteUserData: commentsDeleteUserData,
  })
})

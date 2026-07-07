/**
 * Registriert den GDPR-Contributor des posts-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'posts',
    exportUserData: postsExportUserData,
    deleteUserData: postsDeleteUserData,
  })
})

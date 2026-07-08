/**
 * Registriert den GDPR-Contributor des feedback-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'feedback',
    exportUserData: feedbackExportUserData,
    deleteUserData: feedbackDeleteUserData,
  })
})

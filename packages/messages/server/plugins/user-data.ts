/**
 * Registriert den GDPR-Contributor des messages-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 *
 * AB TAG 1, nicht später: CLAUDE.md verlangt ihn von JEDEM Layer mit
 * User-Daten, und private Nachrichten sind die dichteste Form davon, die
 * dieses Produkt kennt. Ein Kanal ohne Auskunfts- und Löschweg wäre genau die
 * Sorte Nachtrag, die das Konzept an anderer Stelle ablehnt.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'messages',
    exportUserData: messagesExportUserData,
    deleteUserData: messagesDeleteUserData,
  })
})

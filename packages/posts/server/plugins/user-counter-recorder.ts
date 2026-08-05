/**
 * Die AUTORITÄT über die mitschreibenden Zähler (F1, gemeinsames Paket): der
 * posts-Layer besitzt `member_counters` und verbucht deshalb, was core
 * entgegennimmt (`registerUserCounterRecorder`).
 *
 * EINE Autorität je Deployment, und sie gehört zu der Tabelle — nicht zu der
 * Route, die gerade meldet. Genau deshalb kann `comments` in dieselben Zähler
 * melden, ohne `posts` zu kennen (A14): es nennt eine Ereignis-Art, keinen
 * Nachbarn.
 *
 * Fehlt dieser Layer (Silo-App ohne Discussions, Playground), ist der Vertrag
 * unbesetzt und jede Meldung verpufft — kein Fehler, keine Zeile, kein Abzeichen
 * „Editor". Dieselbe gutmütige Richtung wie beim Zähl-Vertrag von Stufe 4.
 */
export default defineNitroPlugin(() => {
  registerUserCounterRecorder(applyMemberCounterEvents)
})

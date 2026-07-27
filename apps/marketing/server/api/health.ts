/**
 * Health der Landing — BEWUSST ohne Appwrite.
 *
 * Der Core-Health (packages/core/server/api/health.ts) fragt die Appwrite-
 * Instanz. Diese Site hat aber gar keine: ihre .env traegt die Appwrite-Keys
 * absichtlich LEER ("oeffentlich + datensparsam, schreibt nichts"), die Werte
 * stehen nur drin, damit Core-/System-Layer ueberhaupt booten. Der Core-Check
 * lief hier deshalb in 500 — die Seite selbst war die ganze Zeit gesund. Ein
 * Health, der eine Abhaengigkeit prueft, die es nicht gibt, ist ein falsches
 * Signal: er haette Uptime-Alarm geschlagen und die Deploy-Verifikation
 * blockiert (genau das ist am 2026-07-27 passiert).
 *
 * Methodenneutral (Datei `health.ts`, nicht `health.get.ts`) wie im Core:
 * UptimeRobot prueft per HEAD, ein GET-only-Handler lieferte 404.
 */
export default defineEventHandler((event) => {
  return {
    ok: true,
    // Deployter Commit — Basis der Deploy-Verifikation (A.5).
    build: useRuntimeConfig(event).public.buildSha || null,
  }
})

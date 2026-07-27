/**
 * Health der Hilfe-Site — BEWUSST ohne Appwrite (Muster: apps/marketing).
 *
 * Der Core-Health (packages/core/server/api/health.ts) fragt die Appwrite-
 * Instanz. Diese Site hat aber gar keine: ihre .env traegt die Appwrite-Werte
 * absichtlich LEER (oeffentlich, read-only, ohne Konto — sie rendert nur
 * Markdown aus content/), die Eintraege existieren nur, damit die Fundament-
 * Layer booten. Der Core-Check liefe hier in 500 — und ein Health, der eine
 * Abhaengigkeit prueft, die es nicht gibt, ist ein falsches Signal: er wuerde
 * Uptime-Alarm schlagen und die Deploy-Verifikation blockieren (genau das ist
 * am 2026-07-27 bei der Landing passiert).
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

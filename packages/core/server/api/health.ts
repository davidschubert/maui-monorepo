import { createAdminClient } from '../lib/appwrite'

/**
 * Health-Check gegen die Appwrite-Instanz via AdminClient (Scope: health.read).
 * user spiegelt event.context.user — ohne Session null (Middleware wirft nicht).
 *
 * Bewusst methodenneutral (Datei `health.ts`, NICHT `health.get.ts`): Uptime-
 * Monitore (UptimeRobot Free-Plan) und Load-Balancer prüfen oft per HEAD —
 * ein GET-only-Handler lieferte HEAD → 404 und damit falsche DOWN-Alerts.
 * H3 verwirft den Body bei HEAD automatisch; der Statuscode ist das Signal.
 */
export default defineEventHandler(async (event) => {
  const { health } = createAdminClient(event)
  const status = await health.get()

  return {
    ok: status.status === 'pass',
    user: event.context.user ?? null,
    // Deployter Commit (Build-Zeit) — Basis der Deploy-Verifikation (A.5)
    build: useRuntimeConfig(event).public.buildSha || null,
  }
})

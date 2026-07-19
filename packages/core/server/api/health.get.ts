import { createAdminClient } from '../lib/appwrite'

/**
 * Health-Check gegen die Appwrite-Instanz via AdminClient (Scope: health.read).
 * user spiegelt event.context.user — ohne Session null (Middleware wirft nicht).
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

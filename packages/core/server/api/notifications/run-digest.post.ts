import { runEmailDigestSweep } from '../../utils/emailDigest'

/**
 * Digest-Sweep manuell auslösen (Ops/Verifikation) — der Intervall-Plugin
 * läuft alle 30 min; diese Route erlaubt „jetzt senden" ohne Warten.
 * system.manage-gated (Betreiber), 503 ohne konfiguriertes SMTP.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  if (!isMailerConfigured(event)) {
    throw createError({ status: 503, statusText: 'SMTP not configured' })
  }
  return await runEmailDigestSweep()
})

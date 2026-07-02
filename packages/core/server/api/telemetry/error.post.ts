import { z } from 'zod'

const clientErrorSchema = z.object({
  source: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(1024).optional(),
})

/**
 * Client-Error-Inbox (Observability-Gate): nimmt Browser-Fehler entgegen und
 * schreibt sie als strukturierte JSON-Zeile ins Server-Log (logEvent). Nur
 * aktiv, wenn die App maui.observability.enabled + clientErrors gesetzt hat —
 * sonst 404. Rate-limited (rate-limit.ts, Bucket telemetry:error). Es wird
 * bewusst NUR das validierte Payload geloggt (keine Header/Cookies — PII).
 */
export default defineEventHandler(async (event) => {
  const gate = useAppConfig().maui?.observability
  if (!gate?.enabled || !gate?.clientErrors) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const payload = await readValidatedBody(event, clientErrorSchema.parse)

  logEvent('error', 'client.error', {
    ...payload,
    // userId hilft beim Zuordnen von Sessions-Fehlern; anonyme Gäste bleiben leer
    userId: event.context.user?.$id ?? '',
  })

  return { ok: true }
})

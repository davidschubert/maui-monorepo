/**
 * Interner Sweep-Endpoint (E3) — Andockpunkt für eine scheduled Appwrite
 * Function (Scaffold Track 2B), die den Reminder-Sweep auch OHNE Seiten-
 * besuche auslöst. Key-geschützt über NUXT_EVENTS_SWEEP_KEY (server-only);
 * ohne konfigurierten Key ist der Endpoint deaktiviert (404 — kein
 * Orakel für Unbefugte).
 *
 * DER SCHLÜSSEL SAGT „WER", NICHT „WESSEN" (Audit-Befund vom 2026-08-02).
 * `sweepEventReminders` geht durch die Datentür, und die scopet nur, wenn ein
 * POOL-Mandant im Request steht. Ohne den lief der Sweep in einem
 * Multi-Tenant-Deployment über ALLE Communities auf einmal — und `notify()`
 * stempelt dann `scope: 'tenant'` mit einer leeren tenantId, die Erinnerung
 * landete also in der „unbekannt"-Ablage (C15) statt in der Glocke ihrer
 * Community. Der Aufrufer muss den Mandanten deshalb im HOST mitbringen, wie
 * jeder andere Request auch: ein Aufruf je Community-Host.
 *
 * Im Silo/Single-Tenant (Gate `pukalani.tenancy.enabled` aus) bleibt alles
 * unverändert — dort gibt es keinen Mandanten, den man verfehlen könnte, das
 * Projekt IST die Grenze.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const key = config.eventsSweepKey
  if (!key) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  if (getHeader(event, 'x-sweep-key') !== key) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { enabled?: boolean } } }
  if (appConfig.pukalani?.tenancy?.enabled === true && useTenant(event)?.mode !== 'pool') {
    // 400, nicht 404: der Aufrufer ist legitimiert (er hat den Schlüssel), er
    // ruft nur die falsche Adresse. Verstecken hilft hier niemandem — der
    // Fehler soll im Cron-Log stehen, damit ihn jemand behebt.
    throw createError({
      status: 400,
      statusText: 'Sweep needs a community host — call it once per community',
      data: { code: 'tenant_required' },
    })
  }

  await sweepEventReminders(event)
  return { ok: true }
})

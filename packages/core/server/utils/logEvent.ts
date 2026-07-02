/**
 * Strukturierte Logs (eine JSON-Zeile pro Ereignis auf stdout/stderr) — das
 * Fundament des Observability-Gates (maui.observability). In Produktion
 * sammelt der Prozess-Manager (ploi/systemd/Docker) stdout ein; die Zeilen
 * sind maschinenlesbar (Log-Shipper, grep -F '"event":"server.error"').
 *
 * Sentry-Andockpunkt: wer einen externen Reporter will, ergänzt ihn HIER
 * (eine Stelle) — z. B. @sentry/node captureException im error-Fall. Bewusst
 * keine SDK-Dependency im Core (Gate bleibt dependency-frei).
 */
export type LogLevel = 'info' | 'warn' | 'error'

export function logEvent(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...data })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

/**
 * Fehler → Log-Payload (pur, getestet). NIEMALS Request-Bodies/Header
 * mitloggen — sie enthalten regelmäßig PII (Passwörter, E-Mails); Pfad,
 * Methode, Status, Message und Server-Stack reichen für die Diagnose.
 */
export function shapeErrorLog(
  error: unknown,
  ctx: { path?: string, method?: string } = {},
): Record<string, unknown> {
  const h3 = error as { statusCode?: number, statusMessage?: string } | null
  const base = {
    path: ctx.path ?? '',
    method: ctx.method ?? '',
    status: typeof h3?.statusCode === 'number' ? h3.statusCode : 500,
  }
  if (error instanceof Error) {
    return { ...base, message: error.message, stack: (error.stack ?? '').split('\n').slice(0, 12).join('\n') }
  }
  return { ...base, message: String(error) }
}

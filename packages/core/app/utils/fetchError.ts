/**
 * Netzwerkfehler (Server nicht erreichbar) von echten API-Antworten
 * unterscheiden — ofetch setzt response nur, wenn der Server geantwortet hat.
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const response = (error as { response?: unknown }).response
  return response === undefined || response === null
}

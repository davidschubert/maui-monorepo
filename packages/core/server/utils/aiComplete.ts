import type { H3Event } from 'h3'

/**
 * Generischer KI-Completion-Client (Core): EIN Transport für alle Server-
 * seitigen KI-Features (Ticket-Triage, Moderations-Assist, …) über eine
 * OpenAI-kompatible Chat-Completions-API (Default: OpenRouter).
 *
 * Policy bleibt beim Konsumenten: aiComplete() prüft nur, ob ein Key da ist —
 * Gates (maui.ai.enabled bzw. Layer-eigene wie maui.tickets.ai) und die
 * Validierung der Antwort gehören in den aufrufenden Layer. Key-Auflösung:
 * options.apiKey (Layer-eigener Key) sonst NUXT_AI_KEY (Core).
 */

const DEFAULT_TIMEOUT_MS = 45_000

export interface AiConfig {
  enabled: boolean
  model: string
  baseUrl: string
}

export interface AiCompleteOptions {
  /** Model-Override — Default: maui.ai.model */
  model?: string
  /** Endpoint-Override (ohne trailing Slash nötig) — Default: maui.ai.baseUrl */
  baseUrl?: string
  /** Layer-eigener Key — Default: runtimeConfig.aiKey (NUXT_AI_KEY) */
  apiKey?: string
  system?: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
  /** Log-Präfix des Aufrufers (z.B. 'tickets') — Fehler bleiben zuordenbar */
  label?: string
}

/** Core-KI-Gate (maui.ai) — Konsumenten prüfen enabled, Transport nicht. */
export function getAiConfig(): AiConfig {
  const appConfig = useAppConfig() as { maui?: { ai?: Partial<AiConfig> } }
  const ai = appConfig.maui?.ai
  return {
    enabled: ai?.enabled ?? false,
    model: ai?.model ?? 'anthropic/claude-haiku-4.5',
    baseUrl: (ai?.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  }
}

/** Ist der Core-KI-Pfad nutzbar (Gate an UND Key vorhanden)? Für UI-Flags. */
export function isAiAvailable(event: H3Event): boolean {
  return getAiConfig().enabled && Boolean(useRuntimeConfig(event).aiKey)
}

export async function aiComplete(event: H3Event, prompt: string, options: AiCompleteOptions = {}): Promise<string> {
  const defaults = getAiConfig()
  const label = options.label ?? 'core'
  const model = options.model ?? defaults.model
  const baseUrl = (options.baseUrl ?? defaults.baseUrl).replace(/\/$/, '')
  const apiKey = options.apiKey || useRuntimeConfig(event).aiKey
  if (!apiKey) {
    throw createError({ status: 503, statusText: 'AI not configured' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(options.system ? [{ role: 'system', content: options.system }] : []),
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 700,
      }),
    })
    if (!res.ok) {
      console.error(`[${label}] KI-API ${res.status}: ${(await res.text()).slice(0, 300)}`)
      throw createError({ status: 502, statusText: 'AI provider unavailable' })
    }
    const payload = await res.json() as { choices?: { message?: { content?: string } }[] }
    return payload.choices?.[0]?.message?.content ?? ''
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error(`[${label}] KI-Completion fehlgeschlagen:`, error)
    throw createError({ status: 502, statusText: 'AI completion failed' })
  }
  finally {
    clearTimeout(timeout)
  }
}

/**
 * Completion mit JSON-Antwort: schneidet defensiv auf das äußere Objekt zu
 * (manche Modelle wrappen trotz Anweisung in ```json) und parst. Der Aufrufer
 * validiert/klemmt die Felder selbst — T ist eine Behauptung, kein Beweis
 * (deshalb sinnvollerweise Partial<...> übergeben).
 */
export async function aiCompleteJson<T = unknown>(event: H3Event, prompt: string, options: AiCompleteOptions = {}): Promise<T> {
  const raw = await aiComplete(event, prompt, options)
  const jsonText = raw.replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}')
  try {
    return JSON.parse(jsonText) as T
  }
  catch {
    console.error(`[${options.label ?? 'core'}] KI-Antwort war kein JSON: ${raw.slice(0, 300)}`)
    throw createError({ status: 502, statusText: 'AI returned no JSON' })
  }
}

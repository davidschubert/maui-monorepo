import type { H3Event } from 'h3'
import { TICKETS_TABLE, type TicketChecklistItem, type TicketRow } from '../../shared/types/ticket'

/** Defensive Kopie des Client-Parsers — Server importiert nicht aus app/ */
function parseChecklist(raw: string): TicketChecklistItem[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

/**
 * KI-Triage (Plan P3): bewertet ein Ticket über eine OpenAI-kompatible
 * Chat-Completions-API (Default: OpenRouter — Model per maui.tickets.ai
 * konfigurierbar, Key server-only NUXT_TICKETS_AI_KEY). Das Ergebnis wird
 * als „🤖 KI-Triage"-Abschnitt in die BESCHREIBUNG geschrieben — Felder
 * (Priorität/Aufwand) ändert die KI bewusst NICHT still (Plan-Entscheidung);
 * die Vorschläge stehen im Text, der Mensch entscheidet.
 */

const TRIAGE_MARKER = '\n\n---\n\n**🤖 KI-Triage'
const REQUEST_TIMEOUT_MS = 45_000

interface TicketsAiConfig {
  enabled: boolean
  model: string
  baseUrl: string
  /** Build-Default aus maui.tickets.ai (ohne Laufzeit-Override) */
  defaultModel: string
}

/** Build-Konfiguration (maui.tickets.ai) — synchron, ohne Laufzeit-Override */
export function getTicketsAiConfig(): TicketsAiConfig {
  const appConfig = useAppConfig() as { maui?: { tickets?: { ai?: Partial<TicketsAiConfig> } } }
  const ai = appConfig.maui?.tickets?.ai
  const model = ai?.model ?? 'anthropic/claude-haiku-4.5'
  return {
    enabled: ai?.enabled ?? false,
    model,
    defaultModel: model,
    baseUrl: (ai?.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
  }
}

/**
 * Effektive Konfiguration inkl. Laufzeit-Override: app_config.ticketsAiModel
 * (system-015, Board-Einstellungen-Modal) schlägt den Build-Default —
 * best-effort, bei Lesefehler gilt der Default.
 */
export async function getEffectiveTicketsAiConfig(event: H3Event): Promise<TicketsAiConfig> {
  const config = getTicketsAiConfig()
  try {
    const runtime = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<import('node-appwrite').Models.Row & { ticketsAiModel?: string }>({
      databaseId: runtime.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    if (typeof row.ticketsAiModel === 'string' && row.ticketsAiModel.trim()) {
      config.model = row.ticketsAiModel.trim()
    }
  }
  catch { /* Override nicht lesbar → Build-Default */ }
  return config
}

interface TriageResult {
  relevance: number
  priority: string
  effort: string
  assessment: string
  questions: string[]
}

function buildPrompt(ticket: TicketRow): string {
  const checklist = parseChecklist(ticket.checklist)
  return [
    'Du triagierst ein Ticket für das Entwicklungs-Board einer Community-Plattform',
    '(Nuxt 4 Monorepo mit Layer-Architektur, Appwrite-Backend; Features: Kommentare,',
    'Posts/Umfragen, Events, Kurse/LMS, Stripe-Abos, Theme-Studio, Admin-Dashboard).',
    '',
    `Titel: ${ticket.title}`,
    ticket.label ? `Label: ${ticket.label}` : '',
    ticket.priority ? `Gesetzte Priorität: ${ticket.priority}` : '',
    ticket.effort ? `Gesetzter Aufwand: ${ticket.effort}` : '',
    '',
    'Beschreibung:',
    ticket.description.split(TRIAGE_MARKER)[0] || '(leer)',
    checklist.length ? `\nCheckliste:\n${checklist.map(i => `- ${i.text}`).join('\n')}` : '',
    '',
    'Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärung außenrum):',
    '{',
    '  "relevance": <1-5, wie relevant/wertvoll fürs Produkt>,',
    '  "priority": "<low|medium|high> (dein Vorschlag)",',
    '  "effort": "<easy|medium|hard|very_hard> (dein Vorschlag)",',
    '  "assessment": "<2-3 Sätze auf Deutsch: Einschätzung + empfohlenes Vorgehen>",',
    '  "questions": ["<offene Rückfragen an den Betreiber, die die KI nicht selbst klären kann — leeres Array wenn keine>"]',
    '}',
  ].filter(line => line !== '').join('\n')
}

async function callCompletions(config: TicketsAiConfig, apiKey: string, prompt: string): Promise<TriageResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 700,
      }),
    })
    if (!res.ok) {
      console.error(`[tickets] Triage-API ${res.status}: ${(await res.text()).slice(0, 300)}`)
      throw createError({ status: 502, statusText: 'Triage provider unavailable' })
    }
    const payload = await res.json() as { choices?: { message?: { content?: string } }[] }
    const raw = payload.choices?.[0]?.message?.content ?? ''
    // Defensiv parsen — manche Modelle wrappen trotz Anweisung in ```json
    const jsonText = raw.replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}')
    const parsed = JSON.parse(jsonText) as Partial<TriageResult>
    return {
      relevance: Math.min(5, Math.max(1, Number(parsed.relevance) || 3)),
      priority: ['low', 'medium', 'high'].includes(parsed.priority ?? '') ? parsed.priority! : 'medium',
      effort: ['easy', 'medium', 'hard', 'very_hard'].includes(parsed.effort ?? '') ? parsed.effort! : 'medium',
      assessment: String(parsed.assessment ?? '').slice(0, 1200),
      questions: (Array.isArray(parsed.questions) ? parsed.questions : []).map(q => String(q).slice(0, 300)).slice(0, 6),
    }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('[tickets] Triage fehlgeschlagen:', error)
    throw createError({ status: 502, statusText: 'Triage failed' })
  }
  finally {
    clearTimeout(timeout)
  }
}

export async function triageTicket(event: H3Event, ticketId: string): Promise<TicketRow> {
  requirePermission(event, 'tickets.manage')

  const config = await getEffectiveTicketsAiConfig(event)
  const apiKey = useRuntimeConfig(event).ticketsAiKey
  if (!config.enabled || !apiKey) {
    throw createError({ status: 503, statusText: 'AI triage not configured' })
  }

  const runtimeConfig = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  const databaseId = runtimeConfig.public.appwriteDatabaseId

  const ticket = await tablesDB.getRow<TicketRow>({
    databaseId, tableId: TICKETS_TABLE, rowId: ticketId,
  }).catch((error) => {
    throw toH3Error(error, 'Ticket not found')
  })

  const result = await callCompletions(config, apiKey, buildPrompt(ticket))

  const stars = '★'.repeat(result.relevance) + '☆'.repeat(5 - result.relevance)
  const section = [
    `${TRIAGE_MARKER} (${config.model}, ${new Date().toISOString().slice(0, 10)})**`,
    '',
    `**Relevanz:** ${stars} · **Prio-Vorschlag:** ${result.priority} · **Aufwands-Vorschlag:** ${result.effort}`,
    '',
    result.assessment,
    ...(result.questions.length
      ? ['', '**Offene Rückfragen:**', ...result.questions.map(q => `- ${q}`)]
      : []),
  ].join('\n')

  // Alte Triage ersetzen (Marker bis Ende — Triage steht immer als letzter Block)
  const base = ticket.description.split(TRIAGE_MARKER)[0] ?? ''
  const description = `${base}${section}`.slice(0, 10000)

  return await tablesDB.updateRow<TicketRow>({
    databaseId, tableId: TICKETS_TABLE, rowId: ticketId, data: { description },
  }).catch((error) => {
    throw toH3Error(error, 'Could not save triage')
  })
}

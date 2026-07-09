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

interface TicketsAiConfig {
  enabled: boolean
  model: string
  baseUrl: string
  /** Build-Default aus maui.tickets.ai (ohne Laufzeit-Override) */
  defaultModel: string
}

/**
 * Build-Konfiguration (maui.tickets.ai) — synchron, ohne Laufzeit-Override.
 * Fällt feldweise auf das Core-Gate maui.ai zurück (aiComplete): eine App,
 * die KI zentral aktiviert, bekommt die Triage mit — maui.tickets.ai bleibt
 * der spezifischere Override.
 */
export function getTicketsAiConfig(): TicketsAiConfig {
  const appConfig = useAppConfig() as { maui?: { tickets?: { ai?: Partial<TicketsAiConfig> } } }
  const ai = appConfig.maui?.tickets?.ai
  const core = getAiConfig()
  const model = ai?.model ?? core.model
  return {
    enabled: ai?.enabled ?? core.enabled,
    model,
    defaultModel: model,
    baseUrl: (ai?.baseUrl ?? core.baseUrl).replace(/\/$/, ''),
  }
}

/**
 * Effektive Konfiguration inkl. Laufzeit-Overrides — Regel: Laufzeit schlägt
 * Build, spezifisch schlägt global. app_config.ticketsAiModel (system-015,
 * Board-Einstellungen-Modal) > app_config.aiModel (system-016, global) >
 * maui.tickets.ai.model > maui.ai.model. Best-effort, bei Lesefehler gilt
 * der Build-Default.
 */
export async function getEffectiveTicketsAiConfig(event: H3Event): Promise<TicketsAiConfig> {
  const config = getTicketsAiConfig()
  try {
    const runtime = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<import('node-appwrite').Models.Row & { ticketsAiModel?: string, aiModel?: string }>({
      databaseId: runtime.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    const override = [row.ticketsAiModel, row.aiModel]
      .find(value => typeof value === 'string' && value.trim())
    if (override) {
      config.model = override.trim()
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

/** Transport via core aiComplete; die Feld-Klemmung (Domäne) bleibt hier. */
async function callCompletions(event: H3Event, config: TicketsAiConfig, apiKey: string, prompt: string): Promise<TriageResult> {
  const parsed = await aiCompleteJson<Partial<TriageResult>>(event, prompt, {
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey,
    temperature: 0.2,
    maxTokens: 700,
    label: 'tickets',
  })
  return {
    relevance: Math.min(5, Math.max(1, Number(parsed.relevance) || 3)),
    priority: ['low', 'medium', 'high'].includes(parsed.priority ?? '') ? parsed.priority! : 'medium',
    effort: ['easy', 'medium', 'hard', 'very_hard'].includes(parsed.effort ?? '') ? parsed.effort! : 'medium',
    assessment: String(parsed.assessment ?? '').slice(0, 1200),
    questions: (Array.isArray(parsed.questions) ? parsed.questions : []).map(q => String(q).slice(0, 300)).slice(0, 6),
  }
}

export async function triageTicket(event: H3Event, ticketId: string): Promise<TicketRow> {
  requirePermission(event, 'tickets.manage')

  const config = await getEffectiveTicketsAiConfig(event)
  // Layer-eigener Key schlägt den Core-Key (NUXT_TICKETS_AI_KEY vor NUXT_AI_KEY)
  const runtime = useRuntimeConfig(event)
  const apiKey = runtime.ticketsAiKey || runtime.aiKey
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

  const result = await callCompletions(event, config, apiKey, buildPrompt(ticket))

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

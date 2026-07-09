import type { TicketChecklistItem, TicketMember, TicketRow } from '../../shared/types/ticket'

/** JSON-Spalten defensiv parsen ('' und kaputte Werte → leer) */
export function parseTicketChecklist(raw: string): TicketChecklistItem[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

export function parseTicketMembers(raw: string): TicketMember[] {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

/**
 * Ticket → Claude-Code-taugliches Markdown (Plan §5): vollständiger
 * Arbeitsauftrag mit Meta, Aufgabe, Checkliste und Projekt-Kontext —
 * zum Kopieren in die Zwischenablage oder als .md-Download.
 */
export function composeTicketMarkdown(options: {
  ticket: TicketRow
  listTitle: string
  url: string
  labels: { label: string, priority: string, effort: string, list: string, due: string, task: string, checklist: string, context: string }
}): string {
  const { ticket, listTitle, url, labels } = options
  const meta: string[] = []
  if (ticket.label) meta.push(`**${labels.label}:** ${ticket.label}`)
  if (ticket.priority) meta.push(`**${labels.priority}:** ${ticket.priority}`)
  if (ticket.effort) meta.push(`**${labels.effort}:** ${ticket.effort}`)
  if (ticket.dueAt) meta.push(`**${labels.due}:** ${ticket.dueAt.slice(0, 10)}`)

  const lines: string[] = [`# ${ticket.title}`, '']
  if (meta.length) lines.push(meta.join(' · '))
  lines.push(`**${labels.list}:** ${listTitle} · [Ticket](${url})`, '')

  lines.push(`## ${labels.task}`, '', ticket.description.trim() || '—', '')

  const checklist = parseTicketChecklist(ticket.checklist)
  if (checklist.length) {
    lines.push(`## ${labels.checklist}`, '')
    for (const item of checklist) lines.push(`- [${item.done ? 'x' : ' '}] ${item.text}`)
    lines.push('')
  }

  lines.push(
    `## ${labels.context}`,
    '',
    '- Projekt: maui-monorepo (Nuxt 4 Layer-Architektur, Appwrite self-hosted, TablesDB)',
    '- Konventionen: CLAUDE.md · Architektur: docs/CONCEPT.md',
    '- Erst grün (lint/typecheck), dann fertig melden; paketweise mit Check-in.',
  )

  return `${lines.join('\n')}\n`
}

/**
 * Anzeige-Metadaten für Label/Priorität/Aufwand — EINE Quelle für Karte,
 * Modal-Selects und Badges (Icons machen die UI scanbarer, Wunsch David).
 */
export const TICKET_LABEL_META: Record<string, { color: 'info' | 'error' | 'neutral', icon: string }> = {
  idea: { color: 'info', icon: 'i-ph-lightbulb' },
  issue: { color: 'error', icon: 'i-ph-bug' },
  other: { color: 'neutral', icon: 'i-ph-chat-circle-dots' },
}

export const TICKET_PRIORITY_META: Record<string, { color: 'error' | 'warning' | 'neutral', icon: string }> = {
  high: { color: 'error', icon: 'i-ph-arrow-up' },
  medium: { color: 'warning', icon: 'i-ph-equals' },
  low: { color: 'neutral', icon: 'i-ph-arrow-down' },
}

export const TICKET_EFFORT_META: Record<string, { icon: string }> = {
  easy: { icon: 'i-ph-feather' },
  medium: { icon: 'i-ph-wrench' },
  hard: { icon: 'i-ph-barbell' },
  very_hard: { icon: 'i-ph-mountains' },
}

import type { Models } from 'node-appwrite'

/**
 * Early-Access-Anfragen (control-017) — die Warteschlange zwischen „jemand will"
 * und „jemand hat".
 *
 * Lebenslauf:
 *   new ──assign──► assigned ──(Wizard löst ein)──► redeemed
 *    │                 │
 *    ├──decline──► declined
 *    └──defer────► deferred ──assign──► assigned
 *
 * `redeemed` wird NICHT geraten: der Onboarding-Pfad schreibt beim Verbrauch
 * des Codes zurück (Zeitpunkt + entstandene Site). Das Dashboard zeigt deshalb
 * „eingelöst am … → host" statt eines Häkchens.
 */

export const INVITE_REQUEST_STATUSES = ['new', 'assigned', 'redeemed', 'declined', 'deferred'] as const
export type InviteRequestStatus = (typeof INVITE_REQUEST_STATUSES)[number]

export interface InviteRequestRow extends Models.Row {
  /** Unique — eine Adresse hat genau EINE Anfrage. */
  email: string
  /** „Wofür willst du Pukalani nutzen?" — Freitext des Anfragenden. */
  note: string
  locale: string
  status: InviteRequestStatus | ''
  /** Zugewiesener Code (Row-Id, nie der Klartext). */
  inviteCodeId: string
  assignedAt: string | null
  redeemedAt: string | null
  /** Die Community, die daraus entstanden ist. */
  communityId: string
  reminders: number
  lastReminderAt: string | null
}

export const INVITE_REQUESTS_TABLE = 'invite_requests'

/** Wie oft darf erinnert werden, und wie eng hintereinander? */
export const REMINDER_MAX = 3
export const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000
/** Ab wann der Knopf im Dashboard hervorgehoben wird (er ist immer da). */
export const REMINDER_SUGGEST_AFTER_MS = 3 * 24 * 60 * 60 * 1000

export type ReminderBlock = 'not-assigned' | 'already-redeemed' | 'cooldown' | 'limit'

export interface ReminderVerdict {
  allowed: boolean
  reason?: ReminderBlock
  /** true = im Dashboard hervorheben (zugewiesen und lange nichts passiert). */
  suggested: boolean
}

/**
 * PURE (unit-getestet): Darf jetzt erinnert werden — und wäre es sinnvoll?
 *
 * Zwei getrennte Fragen mit Absicht: der Knopf ist IMMER sichtbar (jemand ruft
 * an, weil er die Mail gelöscht hat — dann will man sofort handeln können),
 * aber die Bremse schützt die fremde Adresse davor, dass ein hängengebliebener
 * Vorgang zur Mail-Kanone wird. Höchstens eine Erinnerung pro 24 h, höchstens
 * drei insgesamt.
 */
export function evaluateReminder(
  request: Pick<InviteRequestRow, 'status' | 'assignedAt' | 'reminders' | 'lastReminderAt'>,
  now: number,
): ReminderVerdict {
  const status = request.status || 'new'
  if (status === 'redeemed') return { allowed: false, reason: 'already-redeemed', suggested: false }
  if (status !== 'assigned') return { allowed: false, reason: 'not-assigned', suggested: false }

  const assigned = request.assignedAt ? Date.parse(request.assignedAt) : Number.NaN
  const sinceAssigned = Number.isFinite(assigned) ? now - assigned : 0
  const last = request.lastReminderAt ? Date.parse(request.lastReminderAt) : Number.NaN
  const sinceReminder = Number.isFinite(last) ? now - last : Number.POSITIVE_INFINITY
  // „Lange nichts passiert" zählt ab der letzten Aktion, nicht ab der Zuweisung —
  // sonst leuchtet der Knopf direkt nach einer Erinnerung weiter.
  const quietFor = Math.min(sinceAssigned, sinceReminder)
  const suggested = quietFor >= REMINDER_SUGGEST_AFTER_MS

  if ((request.reminders ?? 0) >= REMINDER_MAX) return { allowed: false, reason: 'limit', suggested }
  if (sinceReminder < REMINDER_COOLDOWN_MS) return { allowed: false, reason: 'cooldown', suggested }
  return { allowed: true, suggested }
}

/** Kennzahlen der Warteschlange fürs Dashboard (pure, aus einer Liste). */
export interface RequestStats {
  total: number
  new: number
  assigned: number
  redeemed: number
  declined: number
  deferred: number
  /** Zugewiesen, aber noch nicht eingelöst — die Zeilen, die Arbeit machen. */
  waiting: number
}

export function summarizeRequests(rows: readonly Pick<InviteRequestRow, 'status'>[]): RequestStats {
  const stats: RequestStats = { total: rows.length, new: 0, assigned: 0, redeemed: 0, declined: 0, deferred: 0, waiting: 0 }
  for (const row of rows) {
    const status = (row.status || 'new') as InviteRequestStatus
    if (status in stats) stats[status as keyof RequestStats] = (stats[status as keyof RequestStats] as number) + 1
  }
  stats.waiting = stats.assigned
  return stats
}

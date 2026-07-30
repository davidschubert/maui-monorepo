import type { Models } from 'node-appwrite'

/**
 * Einladungs-Codes fürs Early Access (control-016).
 *
 * Entscheidung David (2026-07-24): der Setup-Flow ist gebaut, aber ein Code
 * steht davor — Öffnen ist später ein Schalter, kein Umbau.
 *
 * WICHTIG, wo das Tor steht: der Code gilt fürs **Anlegen einer Community**,
 * NICHT für die Registrierung. Sonst könnten die eingeladenen MITGLIEDER einer
 * bestehenden Community sich nicht mehr anmelden — sie registrieren sich im
 * selben Pool-Projekt. Geprüft wird der Code beim Betreten des Wizards
 * (nicht verbrauchend, damit niemand sieben Schritte umsonst füllt) und
 * verbraucht beim Anlegen.
 *
 * Der Klartext-Code wird NIE gespeichert (nur sha256), genau wie die
 * Workspace-Einladungs-Tokens — er erscheint einmal im Control und danach nie
 * wieder.
 */

export const INVITE_CODE_STATUSES = ['active', 'revoked'] as const
export type InviteCodeStatus = (typeof INVITE_CODE_STATUSES)[number]

export interface InviteCodeRow extends Models.Row {
  /** sha256(code) als Hex — Unique-Index uq_code. */
  codeHash: string
  /** Freitext für den Betreiber („Newsletter-Welle 1"), nie öffentlich. */
  label: string
  /** Wie oft der Code eingelöst werden darf. 0 = unbegrenzt. */
  maxUses: number
  uses: number
  /** Ablauf (ISO); '' = ohne Ablauf. */
  expiresAt: string
  status: InviteCodeStatus | ''
  /** control-017: nur DIESE Adresse darf einlösen; '' = Inhaberpapier
   *  (Betreiber-Weg, wie bisher). Macht einen weitergeleiteten Code wertlos. */
  boundEmail?: string
  /** Die Anfrage, aus der die Zuweisung entstand; '' = ohne Anfrage. */
  requestId?: string
  assignedAt?: string | null
  /** TATSACHE der Einlösung (nicht Vermutung) + was daraus wurde. */
  redeemedAt?: string | null
  redeemedSiteId?: string
}

export const INVITE_CODES_TABLE = 'invite_codes'

/**
 * Zustand eines Codes im VORRAT (fürs Dashboard) — nicht zu verwechseln mit
 * der Einlöse-Prüfung unten. Hier zählt, was der Betreiber sehen will:
 * wie viele Plätze habe ich noch, wie viele sind unterwegs, wie viele
 * angekommen.
 */
export type InviteCodeState = 'redeemed' | 'revoked' | 'expired' | 'assigned' | 'free'

export interface StockSummary {
  total: number
  free: number
  assigned: number
  redeemed: number
  expired: number
  revoked: number
}

/** PURE (unit-getestet). Reihenfolge zählt: eingelöst bleibt eingelöst, auch
 *  wenn der Code danach abgelaufen wäre — sonst verschwindet ein Erfolg aus
 *  der Statistik, nur weil Zeit vergeht. */
export function inviteCodeState(
  row: Pick<InviteCodeRow, 'status' | 'expiresAt'> & { boundEmail?: string, redeemedAt?: string | null, uses?: number },
  now: number,
): InviteCodeState {
  if (row.redeemedAt || (row.uses ?? 0) > 0) return 'redeemed'
  if ((row.status || 'active') !== 'active') return 'revoked'
  if (row.expiresAt && Date.parse(row.expiresAt) <= now) return 'expired'
  return row.boundEmail ? 'assigned' : 'free'
}

export function summarizeStock(
  rows: readonly (Pick<InviteCodeRow, 'status' | 'expiresAt'> & { boundEmail?: string, redeemedAt?: string | null, uses?: number })[],
  now: number,
): StockSummary {
  const summary: StockSummary = { total: rows.length, free: 0, assigned: 0, redeemed: 0, expired: 0, revoked: 0 }
  for (const row of rows) summary[inviteCodeState(row, now)] += 1
  return summary
}

export type InviteCodeRejection = 'unknown' | 'revoked' | 'expired' | 'exhausted' | 'wrong_email'

export interface InviteCodeVerdict {
  valid: boolean
  reason?: InviteCodeRejection
}

/** E-Mail-Vergleich für die Bindung: Groß-/Kleinschreibung ist bei Adressen
 *  keine Unterscheidung, die ein Mensch trifft — und ein Tippfehler in der
 *  Schreibweise dürfte niemanden aus seiner eigenen Einladung aussperren. */
function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * PURE (unit-getestet): darf dieser Code jetzt eine Community anlegen?
 *
 * `null` (kein Treffer) und ein widerrufener Code liefern bewusst
 * UNTERSCHIEDLICHE Gründe — nach außen wird beides gleich beantwortet
 * (Code-Rateschutz), im Audit-Log ist der Unterschied aber wertvoll.
 * Ein leerer/kaputter Status gilt als 'active' (Bestandsdaten), ein
 * unlesbares Ablaufdatum dagegen als ABGELAUFEN: im Zweifel zu.
 */
export function evaluateInviteCode(
  row: Pick<InviteCodeRow, 'status' | 'expiresAt' | 'maxUses' | 'uses'> & { boundEmail?: string } | null,
  now: number,
  /** Adresse des Einlösenden. Fehlt sie, gilt ein GEBUNDENER Code als
   *  ungültig — ein an jemanden vergebener Code darf nie anonym greifen. */
  email?: string,
): InviteCodeVerdict {
  if (!row) return { valid: false, reason: 'unknown' }
  if ((row.status || 'active') !== 'active') return { valid: false, reason: 'revoked' }
  if (row.boundEmail) {
    if (!email || !sameEmail(row.boundEmail, email)) return { valid: false, reason: 'wrong_email' }
  }
  if (row.expiresAt) {
    const expires = Date.parse(row.expiresAt)
    if (!Number.isFinite(expires) || expires <= now) return { valid: false, reason: 'expired' }
  }
  if (row.maxUses > 0 && row.uses >= row.maxUses) return { valid: false, reason: 'exhausted' }
  return { valid: true }
}

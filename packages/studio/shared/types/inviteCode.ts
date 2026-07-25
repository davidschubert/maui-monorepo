import type { Models } from 'node-appwrite'

/**
 * Einladungs-Codes fürs Early Access (studio-016).
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
 * Workspace-Einladungs-Tokens — er erscheint einmal im Studio und danach nie
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
}

export const INVITE_CODES_TABLE = 'invite_codes'

export type InviteCodeRejection = 'unknown' | 'revoked' | 'expired' | 'exhausted'

export interface InviteCodeVerdict {
  valid: boolean
  reason?: InviteCodeRejection
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
export function evaluateInviteCode(row: Pick<InviteCodeRow, 'status' | 'expiresAt' | 'maxUses' | 'uses'> | null, now: number): InviteCodeVerdict {
  if (!row) return { valid: false, reason: 'unknown' }
  if ((row.status || 'active') !== 'active') return { valid: false, reason: 'revoked' }
  if (row.expiresAt) {
    const expires = Date.parse(row.expiresAt)
    if (!Number.isFinite(expires) || expires <= now) return { valid: false, reason: 'expired' }
  }
  if (row.maxUses > 0 && row.uses >= row.maxUses) return { valid: false, reason: 'exhausted' }
  return { valid: true }
}

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
 * Einladungs-Tokens — er erscheint einmal im Control und danach nie wieder.
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

export type InviteCodeRejection = 'unknown' | 'revoked' | 'expired' | 'exhausted' | 'wrong_email' | 'unverified_email'

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
  /**
   * Hat Appwrite diese Adresse BESTÄTIGT? Pflicht für gebundene Codes seit dem
   * Sicherheits-Audit 2026-08-02 (HOCH).
   *
   * Der Angriff: der Pool ist EIN Appwrite-Projekt, und die Registrierung
   * verlangt keine Bestätigung, bevor man loslegt. Wer also weiß, dass ein Code
   * an `chef@verein.de` vergeben wurde, legt sich auf irgendeinem offenen
   * Pool-Host ein Konto mit genau dieser Adresse an — ohne je an das Postfach
   * zu kommen — und löst den Code ein. Die Bindung an eine Adresse ist nur so
   * viel wert wie der Beweis, dass sie einem gehört.
   *
   * Für UNGEBUNDENE Codes (Inhaberpapier, der Betreiber-Weg) ändert sich
   * nichts: dort ist die Adresse gar kein Teil der Berechtigung.
   */
  emailVerified?: boolean,
): InviteCodeVerdict {
  if (!row) return { valid: false, reason: 'unknown' }
  if ((row.status || 'active') !== 'active') return { valid: false, reason: 'revoked' }
  if (row.boundEmail) {
    if (!email || !sameEmail(row.boundEmail, email)) return { valid: false, reason: 'wrong_email' }
    // NACH der Adressgleichheit, und das ist Absicht: nur wer die passende
    // Adresse führt, erfährt überhaupt den Unterschied zwischen „falsch" und
    // „unbestätigt" — für alle anderen bleibt die Ablehnung ein einziges
    // stummes Nein. Nach außen wird der Grund nur in genau diesem Fall gezeigt
    // (s. control/api/onboarding/site.post.ts).
    if (emailVerified !== true) return { valid: false, reason: 'unverified_email' }
  }
  if (row.expiresAt) {
    const expires = Date.parse(row.expiresAt)
    if (!Number.isFinite(expires) || expires <= now) return { valid: false, reason: 'expired' }
  }
  if (row.maxUses > 0 && row.uses >= row.maxUses) return { valid: false, reason: 'exhausted' }
  return { valid: true }
}

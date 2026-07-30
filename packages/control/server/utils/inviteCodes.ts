import { createHash, randomInt } from 'node:crypto'
import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { INVITE_CODES_TABLE, evaluateInviteCode, type InviteCodeRow, type InviteCodeVerdict } from '../../shared/types/inviteCode'

/**
 * Einladungs-Codes: Suche + Einlösung (control-016).
 *
 * Gespeichert wird nur der sha256-Hash. Codes werden vor dem Hashen
 * normalisiert (trim + Großschreibung), damit „maui-2026-abcd" und
 * „MAUI-2026-ABCD" derselbe Code sind — abgetippte Codes verschluckt man
 * sonst an der Groß-/Kleinschreibung.
 */

export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase(), 'utf8').digest('hex')
}

/**
 * Einen neuen Code-Klartext erzeugen. Verwechslungsfreies Alphabet (kein 0/O,
 * kein 1/I/L) — Codes werden abgetippt und am Telefon vorgelesen; randomInt
 * (CSPRNG), weil der Code das Zugangsgeheimnis IST.
 *
 * Hier und nicht in der Route, weil zwei Wege ihn brauchen: der Betreiber, der
 * einen Code ausstellt, und die Zuweisung aus der Warteschlange.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function issueCodeValue(): string {
  const block = (length: number) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `MAUI-${block(4)}-${block(4)}`
}

export async function findInviteCode(event: H3Event, code: string): Promise<InviteCodeRow | null> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const { rows } = await admin.tablesDB.listRows<InviteCodeRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_CODES_TABLE,
    queries: [Query.equal('codeHash', hashInviteCode(code)), Query.limit(1)],
  })
  return rows[0] ?? null
}

export interface InviteCheck extends InviteCodeVerdict {
  row: InviteCodeRow | null
}

/** Nicht-verbrauchende Prüfung (Wizard-Eintritt). `email` entscheidet über
 *  gebundene Codes (control-017) — ohne sie gilt ein gebundener Code als
 *  ungültig, nie als frei. */
export async function checkInviteCode(
  event: H3Event,
  code: string,
  now: number = Date.now(),
  email?: string,
): Promise<InviteCheck> {
  const row = await findInviteCode(event, code)
  return { ...evaluateInviteCode(row, now, email), row }
}

/**
 * Code verbrauchen — NACH erfolgreicher Anlage.
 *
 * EHRLICHE GRENZE: node-appwrite 26 kennt keinen atomaren Increment, das ist
 * also ein Read-Modify-Write. Zwei exakt gleichzeitige Einlösungen desselben
 * Codes könnten `maxUses` daher um eins überschreiten. Das ist bewusst
 * akzeptiert, weil der Code NICHT die harte Grenze ist: die harte Grenze ist
 * das Konto-Kontingent (eine Community pro Konto in der Testphase,
 * evaluateSiteQuota) — und die wird pro Nutzer geprüft, nicht pro Code.
 * Wird der Code später zur Abrechnungsgrundlage, braucht es hier eine echte
 * Reservierung (eigene Row je Einlösung + Unique-Index).
 *
 * Fehler werden geschluckt und geloggt: die Community EXISTIERT an dieser
 * Stelle schon — sie deswegen zurückzurollen wäre die schlechtere Wahl als
 * ein Code, der einmal zu oft gilt.
 */
export async function consumeInviteCode(event: H3Event, row: InviteCodeRow): Promise<void> {
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  try {
    await admin.tablesDB.updateRow<InviteCodeRow>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: INVITE_CODES_TABLE,
      rowId: row.$id,
      data: { uses: (row.uses ?? 0) + 1 },
    })
  }
  catch (error) {
    logEvent('warn', 'onboarding.invite_consume_failed', {
      inviteCodeId: row.$id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

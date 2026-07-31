import { randomInt } from 'node:crypto'
import { ID } from 'node-appwrite'
import { inviteCodeCreateSchema } from '../../../../schemas/onboarding'
import { INVITE_CODES_TABLE, type InviteCodeRow } from '../../../../shared/types/inviteCode'
import { hashInviteCode } from '../../../utils/inviteCodes'

/**
 * Betreiber: Einladungs-Code ausstellen (Early-Access-Tor, sites.manage).
 *
 * Der Klartext steht EINMAL in der Antwort und danach nirgends mehr — in der
 * Tabelle liegt nur sha256 (gleiches Muster wie die Community-Einladungen).
 * Verliert man ihn, stellt man einen neuen aus; das ist die richtige
 * Asymmetrie, denn ein wiederauffindbarer Code wäre ein dauerhaftes
 * Zugangsgeheimnis in der Datenbank.
 */

// Verwechslungsfreies Alphabet: kein 0/O, kein 1/I/L — Codes werden abgetippt
// und am Telefon vorgelesen.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function block(length: number): string {
  let out = ''
  // randomInt (CSPRNG) statt Math.random: der Code IST das Zugangsgeheimnis.
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const body = await readValidatedBody(event, inviteCodeCreateSchema.parse)

  const code = `PUKA-${block(4)}-${block(4)}`
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const row = await admin.tablesDB.createRow<InviteCodeRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: INVITE_CODES_TABLE,
    rowId: ID.unique(),
    data: {
      codeHash: hashInviteCode(code),
      label: body.label ?? '',
      maxUses: body.maxUses ?? 1,
      uses: 0,
      expiresAt: expiresAt as unknown as string,
      status: 'active',
    },
  }).catch((error) => { throw toH3Error(error, 'Could not create invite code') })

  return {
    id: row.$id,
    /** NUR HIER — wird nicht gespeichert und ist danach nicht wiederherstellbar. */
    code,
    label: row.label,
    maxUses: row.maxUses,
    uses: row.uses,
    expiresAt: row.expiresAt,
    status: row.status,
  }
})

import { ID } from 'node-appwrite'
import { z } from 'zod'
import { INVITE_CODES_TABLE, type InviteCodeRow } from '../../../../shared/types/inviteCode'

/**
 * Betreiber: Vorrat auffüllen (sites.manage).
 *
 * Legt N leere Kontingent-Plätze an — bewusst OHNE Klartext: ein Vorrats-Code
 * bekommt seinen Wert erst beim Zuweisen an eine Anfrage (dann gebunden an
 * deren Adresse und mit frischem Ablauf). Damit liegen nie 50 gültige
 * Geheimnisse herum, und die Zahl im Dashboard bedeutet genau das, was sie
 * soll: „so viele Plätze habe ich noch".
 *
 * Ein Platz IST trotzdem ein vollwertiger Code-Datensatz — nur mit einem Hash,
 * den niemand kennt (Zufallswert, der nie ausgegeben wurde). Er kann deshalb
 * nicht versehentlich eingelöst werden, solange er nicht zugewiesen ist.
 */
const bodySchema = z.object({
  count: z.number().int().min(1).max(100),
  label: z.string().trim().max(120).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
}).strict()

export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const body = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const created: string[] = []
  for (let i = 0; i < body.count; i++) {
    // Unerreichbarer Hash: der Platz ist erst nach dem Zuweisen einlösbar.
    const placeholder = `stock-${ID.unique()}-${ID.unique()}`
    const row = await admin.tablesDB.createRow<InviteCodeRow>({
      databaseId,
      tableId: INVITE_CODES_TABLE,
      rowId: ID.unique(),
      data: {
        codeHash: hashInviteCode(placeholder),
        // Ohne Bezeichnung: ein leerer Platz hat noch keinen Zweck. Sobald er
        // zugewiesen wird, sagt die gebundene Adresse alles Nötige.
        label: body.label ?? '',
        maxUses: 1,
        uses: 0,
        expiresAt: expiresAt as unknown as string,
        status: 'active',
        boundEmail: '',
        requestId: '',
      },
    }).catch(() => null)
    if (row) created.push(row.$id)
  }

  logEvent('info', 'invite.stock_filled', { count: created.length, requested: body.count })
  return { created: created.length }
})

import { z } from 'zod'
import { RESERVED_SUBDOMAINS } from '../../../../schemas/tenant'
import { decideReservedNameCreate } from '../../../../shared/reservedNames'
import { RESERVED_NAMES_TABLE, type ReservedNameRow } from '../../../utils/reservedNames'

/**
 * Betreiber: einen Namen sperren (sites.manage).
 *
 * Die eigentliche Regel steht PURE in shared/reservedNames.ts — hier wird sie
 * nur angewandt und in HTTP übersetzt. Bewusst KEINE `create*Schema(t)`-Factory:
 * die i18n-Factories gibt es für FORMULARE, deren Meldungen der Nutzer liest.
 * Diese Route spricht mit der Oberfläche, und die wählt ihren Text selbst —
 * über `reason` (das zentrale Envelope hebt `data.code` dorthin).
 */
const bodySchema = z.object({
  name: z.string().min(1).max(64),
  note: z.string().trim().max(200).default(''),
}).strict()

export default defineEventHandler(async (event) => {
  requirePermission(event, 'sites.manage')
  const body = await readValidatedBody(event, bodySchema.parse)

  const decision = decideReservedNameCreate(body.name, RESERVED_SUBDOMAINS)
  if (!decision.ok) {
    if (decision.reason === 'system') {
      // Nicht „schon vorhanden": der Name ist gesperrt, aber nicht von hier —
      // eine Zeile dafür wäre Doppelpflege, die löschbar AUSSÄHE.
      throw createError({ status: 409, statusText: 'Already reserved by the platform', data: { code: 'system' } })
    }
    throw createError({ status: 400, statusText: 'Invalid name', data: { code: 'invalid' } })
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.createRow<ReservedNameRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: RESERVED_NAMES_TABLE,
    // Der Name IST die Row-Id — Eindeutigkeit gratis, ein zweiter Versuch
    // scheitert mit 409 (control-027).
    rowId: decision.name,
    data: { note: body.note },
  }).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
      throw createError({ status: 409, statusText: 'Already reserved', data: { code: 'exists' } })
    }
    throw toH3Error(error, 'Could not reserve name')
  })

  return { name: row.$id, note: row.note ?? '' }
})

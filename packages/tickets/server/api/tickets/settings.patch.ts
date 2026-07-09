import { z } from 'zod'

/**
 * KI-Modell zur Laufzeit wechseln — schreibt app_config.ticketsAiModel
 * (system-015). Leerer String = zurück auf den Build-Default aus
 * maui.tickets.ai. Erlaubt sind OpenRouter-artige Ids (vendor/model).
 */
const bodySchema = z.object({
  model: z.string().trim().max(100)
    .regex(/^$|^[\w.-]+\/[\w.:-]+$/, 'Erwartet vendor/model oder leer'),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'tickets.manage')
  const { model } = await readValidatedBody(event, bodySchema.parse)

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)

  await tablesDB.updateRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'app_config',
    rowId: 'global',
    data: { ticketsAiModel: model },
  }).catch((error) => {
    throw toH3Error(error, 'Could not save board settings')
  })

  const effective = await getEffectiveTicketsAiConfig(event)
  return { model: effective.model, defaultModel: effective.defaultModel }
})

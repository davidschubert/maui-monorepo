import { z } from 'zod'

/**
 * KI-Modell zur Laufzeit wechseln — schreibt app_config.ticketsAiModel
 * (system-015). Leerer String = zurück auf den Build-Default aus
 * pukalani.tickets.ai. Erlaubt sind OpenRouter-artige Ids (vendor/model).
 *
 * WARUM HIER `system.manage` UND NICHT `tickets.manage` (Paritäts-Audit
 * 2026-08-02): `app_config/global` ist die INSTANZ-Einstellungszeile, EINE Row
 * pro Projekt. Jeder andere Schreiber darauf (admin/config.patch,
 * admin/themes/settings.patch, admin/products/[key].patch) verlangt
 * `system.manage` — nur diese Route verlangte `tickets.manage`, und die liegt
 * im MODERATOR-Bündel (authz.ts). Ein Moderator konnte damit eine
 * Instanz-Einstellung ändern, die jede KI-Triage auf Kosten des Betreibers
 * über ein anderes (teureres) Modell schickt.
 *
 * Die TRENNLINIE ist deshalb bewusst nicht „Ticket-Fläche vs. Rest", sondern
 * WAS geschrieben wird: das Board BEDIENEN bleibt `tickets.manage` (alle
 * anderen Routen inkl. settings.get), die Instanz UMSTELLEN ist
 * Betreiber-Sache. `system.manage` ist die strikt höhere Hürde — der
 * admin-Operator hält beide Capabilities, für ihn ändert sich nichts.
 */
const bodySchema = z.object({
  model: z.string().trim().max(100)
    .regex(/^$|^[\w.-]+\/[\w.:-]+$/, 'Erwartet vendor/model oder leer'),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
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

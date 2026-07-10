import { ID } from 'node-appwrite'
import { z } from 'zod'

const schema = z.object({
  // Englisch = Hauptsprache (Pflicht); Deutsch = optionale Alternative.
  titleEn: z.string().min(1).max(200),
  bodyEn: z.string().min(1).max(5000),
  title: z.string().max(200).default(''),
  body: z.string().max(5000).default(''),
  category: z.enum(['feature', 'improvement', 'fix']).default('feature'),
  version: z.string().max(30).default(''),
  published: z.boolean().default(true),
  // ISO-Datetime erzwingen → eine ungültige date-Form wird sauber als 400
  // abgewiesen statt als unmaskierter 500 aus der Appwrite-datetime-Spalte.
  date: z.string().datetime().optional(),
})

/** Admin: neuen Changelog-Eintrag anlegen. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'changelog.manage')

  const input = await readValidatedBody(event, schema.parse)
  // title/body sind in Appwrite Pflicht (DE-Spalten). Deutsch bleibt aber
  // optionale Alternative → leer gelassene DE-Felder aus dem Englischen füllen.
  const title = input.title || input.titleEn
  const body = input.body || input.bodyEn
  const data = { ...input, title, body, date: input.date || new Date().toISOString() }
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)

  const row = await admin.tablesDB.createRow({
    databaseId: config.public.appwriteDatabaseId,
    tableId: 'changelog',
    rowId: ID.unique(),
    data,
  })

  // Öffentlichen Changelog-Microcache sofort invalidieren (Idee 3)
  changelogCache.clear()

  await recordAudit(event, { action: 'changelog.created', targetType: 'changelog', targetId: row.$id, targetName: input.titleEn })

  // Activity-Feed (Core-Vertrag, best-effort) — nur für direkt veröffentlichte
  // Einträge; ein späteres Publish via PATCH bleibt bewusst still (v1).
  if (data.published) {
    const user = event.context.user!
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'changelog.published',
      objectType: 'changelog',
      objectId: row.$id,
      link: '/changelog',
      metadata: { snippet: input.titleEn },
    })
  }

  return row
})

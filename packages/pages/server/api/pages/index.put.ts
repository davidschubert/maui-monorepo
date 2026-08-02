import { Query } from 'node-appwrite'
import { pageUpsertSchema } from '../../../schemas/page'
import { PAGES_TABLE, type PageRow } from '../../../shared/types/page'

/**
 * Admin: eine Seiten-Sprachversion anlegen/aktualisieren (upsert nach
 * slug+locale).
 *
 * WER HANDELT (F17): eine Seite ist INHALT der Community (der Kunde sieht sie
 * als seine Seite, nicht als Einstellung) — wer sie schreibt, ist Redaktion.
 * `actor` kommt aus dem Gate: über die Rolle ⇒ 'member' (Inhalts-Sperre M13 und
 * Beitritt A5 gelten), über das Betreiber-Break-Glass ⇒ 'operator'. Die Klinke
 * bleibt 'operator', weil `pages` bewusst ohne Row-Permissions lebt (Entwürfe
 * sind server-only) und ein Session-Client sie damit gar nicht schreiben kann.
 */
export default defineEventHandler(async (event): Promise<PageRow> => {
  const { actor } = await requireCommunityPermission(event, 'pages.manage')
  const body = await readValidatedBody(event, pageUpsertSchema.parse)

  // Datentür statt Hand-Scope: der Upsert-Lookup ist gescopt (geteilter
  // slug-Namensraum — jeder Tenant hat 'home'), create stempelt die
  // tenantId, update belegt die Zugehörigkeit.
  const db = tenantDb(event, { as: 'operator', actor })
  const data = {
    slug: body.slug,
    locale: body.locale,
    title: body.title,
    body: body.body,
    status: body.status,
    sortOrder: body.sortOrder ?? 0,
  }

  const existing = await db.find<PageRow>(PAGES_TABLE, [
    Query.equal('slug', body.slug),
    Query.equal('locale', body.locale),
  ]).catch((error) => {
    throw toH3Error(error, 'Could not save page')
  })

  if (existing) {
    return await db.update<PageRow>(PAGES_TABLE, existing.$id, data)
      .catch((error) => {
        throw toH3Error(error, 'Could not save page')
      })
  }
  // permissions: [] BEWUSST — Seiten-Rows tragen keine Row-Permissions
  // (Entwürfe sind server-only, die öffentliche Route filtert auf published).
  // Ohne das Leer-Array würde die Tür ihr Standard-Publikum stempeln und
  // Entwürfe per Roh-REST für Mitglieder lesbar machen.
  return await db.create<PageRow>(PAGES_TABLE, data, { permissions: [] })
    .catch((error) => {
      throw toH3Error(error, 'Could not save page')
    })
})

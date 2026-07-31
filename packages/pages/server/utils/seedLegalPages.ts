import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { PAGES_TABLE, type PageRow } from '../../shared/types/page'
import { legalTemplates } from '../../shared/legalTemplates'

/**
 * Impressum + Datenschutz als VORLAGEN-ENTWÜRFE einer frisch angelegten
 * Community (Audit-Befund S7, Teil 1 — Davids Entscheidung 5).
 *
 * Der Kunde ist Betreiber seiner Community und damit für diese beiden Seiten
 * verantwortlich. Wir liefern deshalb die Struktur, nicht den Text:
 *
 *  - **`status: 'draft'`.** Ein Rechtstext voller Platzhalter darf nie
 *    öffentlich erreichbar sein — die öffentlichen Routen filtern hart auf
 *    `status='published'`, ein Entwurf verlässt den Server also nicht (404).
 *    Der Kunde füllt und veröffentlicht bewusst selbst.
 *  - **Explizite `tenantId`** wie bei `seedHomePage`: der Aufruf läuft auf dem
 *    Kontroll-Host, wo es bewusst keinen Mandanten-Kontext gibt. Ohne Scope
 *    wird NICHTS geschrieben — eine Seite ohne Scope wäre im Pool die Seite
 *    von allen.
 *  - **Idempotent je slug+locale.** Ein Retry der Provisionierung findet die
 *    vorhandene Row und lässt sie unberührt; der Unique-Index
 *    `uq_slug_locale_tenant` (pages-004) ist das Netz darunter, ein 409 aus
 *    einem Wettlauf gilt deshalb als „schon da".
 *
 * Rows tragen wie alle `pages`-Rows KEINE Permissions (pages-001): gelesen
 * wird nur server-seitig über die Datentür.
 */
export interface SeedLegalPagesInput {
  tenantId: string
  /** Sprache der Community (Wizard-Antwort); unbekannt ⇒ englische Vorlage. */
  locale: string
}

export interface SeedLegalPagesResult {
  created: string[]
  skipped: string[]
}

export async function seedLegalPages(event: H3Event, input: SeedLegalPagesInput): Promise<SeedLegalPagesResult> {
  const result: SeedLegalPagesResult = { created: [], skipped: [] }
  if (!input.tenantId) {
    logEvent('error', 'pages.seed_legal_without_scope', { locale: input.locale })
    return result
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const locale = input.locale || 'en'

  for (const template of legalTemplates(locale)) {
    const existing = await admin.tablesDB.listRows<PageRow>({
      databaseId,
      tableId: PAGES_TABLE,
      queries: [
        Query.equal('communityId', input.tenantId),
        Query.equal('slug', template.slug),
        Query.equal('locale', locale),
        Query.limit(1),
      ],
    })
    if (existing.rows[0]) {
      result.skipped.push(template.slug)
      continue
    }

    try {
      await admin.tablesDB.createRow<PageRow>({
        databaseId,
        tableId: PAGES_TABLE,
        rowId: ID.unique(),
        data: {
          slug: template.slug,
          locale,
          communityId: input.tenantId,
          title: template.title,
          body: template.body,
          status: 'draft',
          sortOrder: template.sortOrder,
        },
      })
      result.created.push(template.slug)
    }
    catch (error) {
      // 409 = der Unique-Index hat einen Wettlauf abgefangen (Doppelklick auf
      // „Community anlegen"). Das ist kein Fehler, das ist der gewünschte
      // Ausgang: die Seite existiert.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) {
        result.skipped.push(template.slug)
        continue
      }
      throw error
    }
  }

  return result
}

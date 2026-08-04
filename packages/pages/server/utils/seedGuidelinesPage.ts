import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { PAGES_TABLE, type PageRow } from '../../shared/types/page'
import { guidelinesTemplate, guidelinesTemplateLocale } from '../../shared/guidelinesTemplate'

/**
 * Die Community-Regeln einer frisch angelegten Community (F1 Stufe 2).
 *
 * Bewusst NEBEN `seedLegalPages` und nicht darin: die beiden unterscheiden sich
 * in genau der Eigenschaft, die dort im Kopf als tragend beschrieben ist. Die
 * Rechtstexte entstehen als ENTWURF, weil sie Platzhalter tragen und der Kunde
 * für sie verantwortlich ist; die Regeln entstehen VERÖFFENTLICHT, weil ein
 * Regelwerk, das niemand sehen kann, keines ist. Beides in eine Funktion mit
 * einem Schalter zu legen hieße, den einen Unterschied hinter einem Argument zu
 * verstecken.
 *
 * Alles Übrige ist bewusst identisch, damit es sich gleich verhält:
 *  - **Explizite `tenantId`.** Der Aufruf läuft auf dem Kontroll-Host, wo es
 *    keinen Mandanten-Kontext gibt. Ohne Scope wird NICHTS geschrieben — eine
 *    Seite ohne Scope wäre im Pool die Seite von allen.
 *  - **Idempotent je slug+locale.** Ein Retry der Provisionierung findet die
 *    vorhandene Row und lässt sie unberührt; der Unique-Index
 *    `uq_slug_locale_tenant` (pages-004) ist das Netz darunter, ein 409 aus
 *    einem Wettlauf gilt deshalb als „schon da".
 *  - **Keine Row-Permissions** (pages-001): gelesen wird nur server-seitig über
 *    die Datentür, und die öffentliche Route prüft das Publikum selbst (C18).
 *
 * NUR EINE SPRACHE, nämlich die der Community. Die Rechtsvorlagen machen es
 * genauso. Eine zweite Sprachfassung mitzuliefern, die niemand pflegt, wäre
 * eine Seite, die eines Tages etwas anderes sagt als ihr Gegenstück — der
 * Owner legt weitere Sprachen bewusst selbst an.
 *
 * BESTANDS-COMMUNITIES bekommen hierdurch NICHTS. Sie sind schon angelegt, und
 * eine Migration, die in fremde Inhalte schreibt, wäre der falsche Weg (es ist
 * die Seite des Owners, nicht unsere). Seit dem 2026-08-04 greift für sie der
 * RÜCKFALL: fehlt die Zeile, liefern die öffentlichen Routen die Vorlage aus
 * und das Dashboard bietet sie zum Bearbeiten an
 * (`shared/guidelinesFallback.ts` — dort steht auch, warum es kein Backfill
 * geworden ist). Die beiden widersprechen sich nie: eine vorhandene Zeile
 * gewinnt immer, dieser Seed ist der Normalfall, der Rückfall das Netz.
 */
export interface SeedGuidelinesInput {
  tenantId: string
  /** Sprache der Community (Wizard-Antwort); unbekannt ⇒ englische Vorlage. */
  locale: string
}

export type SeedGuidelinesResult = 'created' | 'skipped' | 'unscoped'

export async function seedGuidelinesPage(event: H3Event, input: SeedGuidelinesInput): Promise<SeedGuidelinesResult> {
  if (!input.tenantId) {
    logEvent('error', 'pages.seed_guidelines_without_scope', { locale: input.locale })
    return 'unscoped'
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId
  const locale = guidelinesTemplateLocale(input.locale)
  const template = guidelinesTemplate(locale)

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
  if (existing.rows[0]) return 'skipped'

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
        // VERÖFFENTLICHT — siehe Kopf. Der einzige inhaltliche Unterschied zu
        // den Rechtsvorlagen, und der Grund, warum das eine eigene Funktion ist.
        status: 'published',
        sortOrder: template.sortOrder,
      },
    })
    return 'created'
  }
  catch (error) {
    // 409 = der Unique-Index hat einen Wettlauf abgefangen (Doppelklick auf
    // „Community anlegen"). Das ist kein Fehler, das ist der gewünschte
    // Ausgang: die Seite existiert.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 409) return 'skipped'
    throw error
  }
}

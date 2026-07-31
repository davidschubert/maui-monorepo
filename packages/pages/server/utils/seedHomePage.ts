import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { PAGES_TABLE, type PageRow } from '../../shared/types/page'

/**
 * Die erste Startseite einer frisch angelegten Community (O6, Schritt 8).
 *
 * Wird vom Onboarding gerufen — und zwar mit EXPLIZITER `tenantId`, nicht über
 * scopeRow: der Aufruf läuft auf dem Kontroll-Host, wo es bewusst keinen
 * Mandanten-Kontext gibt. Der Scope kommt deshalb als Argument aus dem
 * Anlage-Ergebnis; ohne ihn wird NICHTS geschrieben (eine Seite ohne Scope
 * wäre im Pool die Seite von allen).
 *
 * Idempotent: existiert für diesen Mandanten schon eine `home`-Row in dieser
 * Sprache, bleibt sie unberührt — ein Retry darf die Arbeit des Kunden nicht
 * überschreiben.
 *
 * Der Layer besitzt die Tabelle (A14), also lebt der Helfer hier und nicht im
 * Onboarding.
 */
export interface SeedHomePageInput {
  tenantId: string
  locale: string
  title: string
  /** Beschreibung aus dem Wizard; leer = schlichter Willkommenstext. */
  description?: string
  /** Übersetzter Fallback-Text (der Layer kennt keine i18n-Instanz). */
  fallbackBody: string
}

export async function seedHomePage(event: H3Event, input: SeedHomePageInput): Promise<PageRow | null> {
  if (!input.tenantId) {
    logEvent('error', 'pages.seed_home_without_scope', { locale: input.locale })
    return null
  }

  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const databaseId = config.public.appwriteDatabaseId

  const existing = await admin.tablesDB.listRows<PageRow>({
    databaseId,
    tableId: PAGES_TABLE,
    queries: [
      Query.equal('communityId', input.tenantId),
      Query.equal('slug', 'home'),
      Query.equal('locale', input.locale),
      Query.limit(1),
    ],
  })
  if (existing.rows[0]) return existing.rows[0]

  const body = input.description?.trim() || input.fallbackBody

  return admin.tablesDB.createRow<PageRow>({
    databaseId,
    tableId: PAGES_TABLE,
    rowId: ID.unique(),
    data: {
      slug: 'home',
      locale: input.locale,
      tenantId: input.tenantId,
      communityId: input.tenantId,
      title: input.title,
      body,
      // Veröffentlicht: die Community soll ab der ersten Sekunde etwas zeigen.
      // Der Owner kann sie danach jederzeit ändern — ab dann ist die Seite die
      // Wahrheit, nicht mehr die Wizard-Antwort.
      status: 'published',
      sortOrder: 0,
    },
  })
}

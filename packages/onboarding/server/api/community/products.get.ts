import type { ManifestText } from '../../../../core/shared/types/manifest'

/**
 * DER PRODUKT-KATALOG AUS SICHT EINER COMMUNITY — Datenquelle des Reiters
 * „Produkte" (F51 Paket 2, 2026-08-07).
 *
 * ── WARUM EINE EIGENE ROUTE UND NICHT `/api/platform/products` ─────────────
 * Die öffentliche Schwester (packages/core/server/api/platform/products.get.ts)
 * gibt BEWUSST nur Schlüssel heraus: `{ products: ['comments', 'posts', …] }`.
 * Sie ist unauthentifiziert und bedient den Health-Sweep des Control Plane —
 * eine Liste, aus der man ein Menü bauen kann, ist dort ausdrücklich nicht
 * gewollt. Die KATALOG-TEXTE (Titel, Beschreibung, Icon) leben in den
 * `product.manifest.ts` der Layer und werden bisher nur von
 * `/api/admin/products` herausgegeben — und die verlangt `system.manage`, also
 * das BETREIBER-Label. Ein Community-Owner kommt dort nie durch.
 *
 * Diese Route ist deshalb die dritte Projektion derselben Registry, mit der
 * dritten Frage und der dritten Tür: „was hat MEINE Community, und was hängt
 * an meinem Tarif?", beantwortet für `team.manage`.
 *
 * ── WAS SIE NICHT TUT ──────────────────────────────────────────────────────
 * Sie SCHALTET nichts. Produkte schaltet der Betreiber (/dashboard/admin/
 * products, app_config); der Owner ändert seinen TARIF. Deshalb gibt es hier
 * kein PATCH-Gegenstück und auf der Seite keinen einzigen Schalter.
 *
 * ── DIE AUSWAHL ────────────────────────────────────────────────────────────
 *  · nur `tier: 'optional'` — Grundgerüst (core, system, admin, themes,
 *    blueprint, onboarding, billing) ist kein Angebot, sondern der Boden, auf
 *    dem alles steht. Ein Kunde kann es weder haben noch nicht haben.
 *  · nur EFFEKTIV AKTIVE — ein vom Betreiber abgeschaltetes Produkt antwortet
 *    an seinen Routen ohnehin 404; es hier zu nennen hieße, etwas zu
 *    versprechen, das auch der höchste Tarif nicht bringt.
 *  · KEINE weitere Kuratierung. Welche Produkte einem Mandanten gehören, sagt
 *    `pukalani.tenancy.products` selbst — inklusive des Satzes „nicht
 *    gelistete Produkte (comments, pages, Moderation) sind Basic = frei"
 *    (apps/platform/app/app.config.ts). Eine handgepflegte zweite Liste hier
 *    wäre die dritte Wahrheit und die erste, die veraltet.
 *
 * Der MINDEST-PLAN kommt aus derselben Zeile, die auch `useTenantPlan()` im
 * Browser liest — die Seite rechnet also nicht gegen eine zweite Quelle,
 * sondern bekommt hier nur das, was ihr sonst fehlt: die Texte.
 */
export interface CommunityProductEntry {
  key: string
  title: ManifestText
  description: ManifestText
  icon?: string
  /** Mindest-Plan aus `pukalani.tenancy.products`; '' = in jedem Tarif dabei. */
  minPlan: string
}

export default defineEventHandler(async (event): Promise<{ products: CommunityProductEntry[] }> => {
  const tenant = useTenant(event)
  // Kein Pool-Mandant ⇒ es gibt keinen Tarif, der etwas freischalten könnte.
  if (tenant?.mode !== 'pool') {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  await requireCommunityPermission(event, 'team.manage')

  const appConfig = useAppConfig() as {
    pukalani?: { tenancy?: { products?: Record<string, string | undefined> } }
  }
  const minPlans = appConfig.pukalani?.tenancy?.products ?? {}

  const states = await getEffectiveProducts(event)
  const products: CommunityProductEntry[] = []
  for (const manifest of getProductRegistry().values()) {
    if (manifest.tier !== 'optional') continue
    const state = states[manifest.key] ?? { enabled: true, status: 'active' }
    if (!state.enabled || state.status !== 'active') continue
    products.push({
      key: manifest.key,
      title: manifest.title,
      description: manifest.description,
      icon: manifest.icon,
      minPlan: minPlans[manifest.key] ?? '',
    })
  }

  // Stabil nach Schlüssel — die Registry-Reihenfolge hängt an der Lade-
  // Reihenfolge der Nitro-Plugins, die Anzeige darf das nicht.
  products.sort((a, b) => a.key.localeCompare(b.key))
  return { products }
})

import type { MaybeRefOrGetter } from 'vue'

export interface BrandTitleOptions {
  /**
   * meta description + og:description (Audit-Befund S5). Leer/undefined =
   * kein Tag — ein leeres description-Meta ist schlechter als keines.
   */
  description?: MaybeRefOrGetter<string | undefined>
}

/**
 * Seitenkopf einer öffentlichen Seite: Titel im Muster „<Seite> · <Brand>"
 * (i18n-Key `ui.metaTitle`) plus die gespiegelten Social-Tags.
 *
 * Warum eine Composable und kein useHead je Seite: die Titel der Tenant-Seiten
 * waren markenlos und in EN wie DE identisch („Feed", „About me" — Audit-Befund
 * S8), geteilte Links kamen ohne description/og:* an (S5). Beides hängt an
 * derselben Brand-Kette wie Header/Footer/404 (useBrandName: Tenant vor
 * App-Brand vor „Maui"), also gehört es an EINE Stelle.
 *
 * Reaktiv gedacht: `page`/`description` werden als Getter übergeben, damit ein
 * Sprachwechsel oder ein nachgeladener Inhalt den Kopf mitzieht.
 *
 * og:image ist BEWUSST nicht dabei — dafür braucht es eine Design-Entscheidung
 * (Tenant-Logo/Generator), kein Platzhalterbild.
 */
export function useBrandTitle(page: MaybeRefOrGetter<string>, options: BrandTitleOptions = {}): void {
  const { t } = useI18n()
  const brand = useBrandName()

  // Ohne Seitenname (Inhalt noch nicht da) bleibt der Brand allein stehen —
  // nie „ · Morgenlicht" mit führendem Trenner.
  const title = computed<string>(() => {
    const name = toValue(page).trim()
    return name.length > 0 ? t('ui.metaTitle', { page: name, brand: brand.value }) : brand.value
  })

  const description = computed<string | null>(() => {
    const text = toValue(options.description)?.trim()
    return text && text.length > 0 ? text : null
  })

  useSeoMeta({
    title: () => title.value,
    ogTitle: () => title.value,
    description: () => description.value,
    ogDescription: () => description.value,
  })
}

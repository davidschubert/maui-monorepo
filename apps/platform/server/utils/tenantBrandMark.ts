// Layer-Code explizit relativ (wie server/plugins/tenant-resolver.ts): die APP
// verdrahtet hier Themes-Registry + Core-Utility zu einer Antwort — beide
// Module sind pure TypeScript ohne Nuxt-/Appwrite-Bindung.
import type { H3Event } from 'h3'
import { THEME_REGISTRY } from '../../../../packages/themes/app/utils/themeRegistry'
import { customThemeAttr } from '../../../../packages/themes/shared/ramp'
import { resolveBrandColor, type BrandThemeEntry } from '../../../../packages/themes/shared/brandMark'

/**
 * Farbe + Name der Community, aus denen JEDE Bildmarke dieses Hosts entsteht:
 * das Favicon (`/favicon.svg`) und die Vorschau-Karte (`/og/<key>.png`).
 *
 * Warum EINE Auflösung für beide: Tab-Icon, `theme-color` und das Bild in
 * WhatsApp müssen dieselbe Farbe zeigen. Zwei nachgebaute Wege wären genau die
 * Art Kopie, die später auseinanderläuft — die Karte war anfangs eine solche
 * Kopie der Favicon-Route, deshalb steht das jetzt hier.
 *
 * Datenquelle ist bewusst die vorhandene öffentliche Route `/api/themes`: sie
 * kennt Custom Themes UND wendet das Mandanten-Branding
 * (`tenants.theme/variant` schlägt `app_config.themeSettings`, O5) bereits an.
 * Der interne Aufruf reicht den Host-Header weiter — ohne ihn löste die
 * Tenant-Middleware einen anderen (oder gar keinen) Mandanten auf.
 *
 * Kontroll-Hosts (my./start.) haben keinen Mandanten und `/api/themes` steht
 * dort nicht auf der Freigabeliste (01.control-center.ts) → App-Brand + Farbe
 * des Core-Defaults. Das ist gewollt: der Kundenbereich ist Pukalani, keine
 * Community. Fehler/leere Antwort → Default-Farbe statt 500: eine Bildmarke
 * darf nie der Grund sein, dass eine Seite kaputt aussieht.
 */

/** Antwort von /api/themes (system-Layer) — nur die Felder, die die Marke braucht. */
interface ThemesResponse {
  themes?: { id: string, primary: string, variants?: { id: string, color: string }[] }[]
  settings?: { defaultThemeId?: string, defaultVariantId?: string }
}

export interface TenantBrandMark {
  /** Primärfarbe des voreingestellten Community-Themes (Hex) */
  color: string
  /** Anzeigename der Community, sonst App-Brand */
  name: string
}

interface CacheEntry {
  at: number
  mark: TenantBrandMark
}

/**
 * Kurzlebiger Speicher je Host. Grund: die Vorschau-Karte wird von Crawlern
 * abgeholt, und ohne diesen Speicher löste JEDER Abruf einen Appwrite-Read aus
 * — auch dann, wenn das Bild danach ungelesen von Platte kommt. 60 s ist die
 * gleiche Größenordnung wie der Tenant-Resolver-Cache (≤30 s); ein Theme-
 * Wechsel erscheint also spätestens nach einer Minute in der Bild-URL.
 */
const CACHE_TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

export async function resolveTenantBrandMark(event: H3Event): Promise<TenantBrandMark> {
  const host = (getHeader(event, 'host') ?? '').toLowerCase()
  const hit = cache.get(host)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.mark

  const tenant = event.context.tenant
  const appConfig = useAppConfig() as { maui?: { brand?: { name?: string } } }
  const name = tenant?.name || appConfig.maui?.brand?.name || ''

  const data = await $fetch<ThemesResponse>('/api/themes', { headers: { host } }).catch(() => null)
  const customs: BrandThemeEntry[] = (data?.themes ?? []).map(entry => ({
    id: customThemeAttr(entry.id),
    color: entry.primary,
    variants: entry.variants ?? [],
  }))
  const mark: TenantBrandMark = {
    color: resolveBrandColor(
      [...THEME_REGISTRY, ...customs],
      data?.settings?.defaultThemeId,
      data?.settings?.defaultVariantId,
    ),
    name,
  }

  // Nur bei erfolgreichem Read merken — sonst zementiert ein einzelner
  // Aussetzer die Default-Farbe für eine Minute.
  if (data) cache.set(host, { at: Date.now(), mark })
  return mark
}

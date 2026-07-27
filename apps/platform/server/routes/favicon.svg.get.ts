// Layer-Code explizit relativ (wie server/plugins/tenant-resolver.ts): die APP
// verdrahtet hier Themes-Registry + Core-Utility zu einer Antwort — beide
// Module sind pure TypeScript ohne Nuxt-/Appwrite-Bindung.
import { THEME_REGISTRY } from '../../../../packages/themes/app/utils/themeRegistry'
import { customThemeAttr } from '../../../../packages/themes/shared/ramp'
import { brandFaviconSvg, resolveBrandColor, type BrandThemeEntry } from '../../../../packages/themes/shared/brandMark'
import { avatarInitials } from '../../../../packages/core/app/utils/avatar'

/** Antwort von /api/themes (system-Layer) — nur die Felder, die die Marke braucht. */
interface ThemesResponse {
  themes?: { id: string, primary: string, variants?: { id: string, color: string }[] }[]
  settings?: { defaultThemeId?: string, defaultVariantId?: string }
}

/**
 * Das Favicon EINER Community (Audit-Befund K2): gefüllter Kreis in der
 * Primärfarbe ihres Themes + Initial ihres Namens, als SVG generiert.
 *
 * Warum in der Platform-App und nicht im Core: nur hier bedient ein Prozess
 * viele Mandanten-Hosts, und nur hier steht `event.context.tenant`. Silo-Apps
 * behalten ihr eigenes Favicon (das Gate `maui.seo.tenantFavicon` ist
 * Core-Default AUS — ohne Gate verlinkt niemand auf diese Route).
 *
 * Datenquelle ist bewusst die vorhandene öffentliche Route `/api/themes`: sie
 * kennt Custom Themes UND wendet das Mandanten-Branding
 * (`tenants.theme/variant` schlägt `app_config.themeSettings`, O5) bereits an.
 * Ein zweiter, hier nachgebauter Auflösungsweg wäre genau die Art Kopie, die
 * später auseinanderläuft. Der interne Aufruf reicht den Host-Header weiter —
 * ohne ihn löste die Tenant-Middleware einen anderen (oder gar keinen)
 * Mandanten auf. Fehler/leere Antwort → Default-Farbe statt 500: ein Favicon
 * darf nie der Grund sein, dass eine Seite kaputt aussieht.
 *
 * Kontroll-Hosts (my./start.) haben keinen Mandanten und `/api/themes` steht
 * dort nicht auf der Freigabeliste (01.control-center.ts) → App-Brand + Farbe
 * des Core-Defaults. Das ist gewollt: der Kundenbereich ist Pukalani, keine
 * Community.
 *
 * BEWUSSTER REST: kein `apple-touch-icon`. iOS akzeptiert dafür ausschließlich
 * PNG — das hieße Rasterung zur Laufzeit (Bibliothek + CPU je Mandant) oder ein
 * vorgerendertes Bild je Community. Beides ist mehr, als der Befund wert ist;
 * Android/Chrome nutzen ohnehin `theme-color` + das SVG-Icon.
 */
export default defineEventHandler(async (event) => {
  const tenant = event.context.tenant
  const appConfig = useAppConfig() as { maui?: { brand?: { name?: string } } }
  const brandName = tenant?.name || appConfig.maui?.brand?.name || ''

  const data = await $fetch<ThemesResponse>('/api/themes', {
    headers: { host: getHeader(event, 'host') ?? '' },
  }).catch(() => null)

  const customs: BrandThemeEntry[] = (data?.themes ?? []).map(entry => ({
    id: customThemeAttr(entry.id),
    color: entry.primary,
    variants: entry.variants ?? [],
  }))
  const color = resolveBrandColor(
    [...THEME_REGISTRY, ...customs],
    data?.settings?.defaultThemeId,
    data?.settings?.defaultVariantId,
  )

  setHeader(event, 'content-type', 'image/svg+xml; charset=utf-8')
  // Öffentlich und user-agnostisch (die Marke folgt bewusst NICHT der
  // persönlichen Theme-Wahl). HTTP-Caches schlüsseln nach voller URL inkl.
  // Host — die Antwort eines Mandanten kann nicht bei einem anderen landen.
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return brandFaviconSvg(color, avatarInitials(brandName))
})

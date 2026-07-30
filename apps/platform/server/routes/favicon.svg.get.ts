// Layer-Code explizit relativ (wie server/plugins/tenant-resolver.ts): die APP
// verdrahtet hier Themes-Registry + Core-Utility zu einer Antwort — beide
// Module sind pure TypeScript ohne Nuxt-/Appwrite-Bindung.
import { brandFaviconSvg } from '../../../../packages/themes/shared/brandMark'
import { avatarInitials } from '../../../../packages/core/app/utils/avatar'
import { resolveTenantBrandMark } from '../utils/tenantBrandMark'

/**
 * Das Favicon EINER Community (Audit-Befund K2): gefüllter Kreis in der
 * Primärfarbe ihres Themes + Initial ihres Namens, als SVG generiert.
 *
 * Warum in der Platform-App und nicht im Core: nur hier bedient ein Prozess
 * viele Mandanten-Hosts, und nur hier steht `event.context.tenant`. Silo-Apps
 * behalten ihr eigenes Favicon (das Gate `maui.seo.tenantFavicon` ist
 * Core-Default AUS — ohne Gate verlinkt niemand auf diese Route).
 *
 * Farbe und Name kommen seit 2026-07-29 aus `resolveTenantBrandMark()` —
 * derselben Auflösung, aus der die Vorschau-Karte `/og/<key>.png` entsteht.
 * Tab-Icon, `theme-color` und das Bild in WhatsApp zeigen damit garantiert
 * dieselbe Farbe (vorher stand die Auflösung nur hier; die Karte hätte sie
 * kopieren müssen).
 *
 * HIER ist SVG richtig, bei der Vorschau-Karte NICHT: Browser rendern ein
 * SVG-Favicon in jeder Größe scharf, Facebook/WhatsApp/LinkedIn zeigen ein SVG
 * als og:image dagegen überhaupt nicht (deshalb brandCardPng.ts).
 *
 * BEWUSSTER REST: kein `apple-touch-icon`. iOS akzeptiert dafür ausschließlich
 * PNG in mehreren festen Größen — technisch möglich wäre es jetzt (der
 * PNG-Schreiber steht), es hieße aber weitere Routen und Größen für einen
 * Nutzen, den `theme-color` + SVG-Icon auf Android/Chrome ohnehin abdecken.
 */
export default defineEventHandler(async (event) => {
  const { color, name } = await resolveTenantBrandMark(event)

  setHeader(event, 'content-type', 'image/svg+xml; charset=utf-8')
  // Öffentlich und user-agnostisch (die Marke folgt bewusst NICHT der
  // persönlichen Theme-Wahl). HTTP-Caches schlüsseln nach voller URL inkl.
  // Host — die Antwort eines Mandanten kann nicht bei einem anderen landen.
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return brandFaviconSvg(color, avatarInitials(name))
})

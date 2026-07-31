// Layer-Code explizit relativ (wie favicon.svg.get.ts): die APP verdrahtet
// Themes-Bildmarke und Mandanten-Kontext zu einer Antwort.
import { BRAND_CARD_KEY_PATTERN, brandCardKey } from '../../../../../packages/themes/shared/brandCard'
import { resolveTenantBrandMark } from '../../utils/tenantBrandMark'
import { brandCardPng } from '../../utils/brandCardStore'

/**
 * Das Vorschaubild einer Community für geteilte Links (og:image, OPEN-ITEMS
 * B2): `/og/<key>.png`, 1200×630, Basisfarbe des Community-Themes +
 * Community-Name + dezente Wortmarke.
 *
 * PNG, nicht SVG: Facebook, WhatsApp und LinkedIn ignorieren ein SVG als
 * og:image vollständig. Gerastert wird ohne Renderer im Betrieb — Chrome hat
 * die Zeichen EINMAL gebacken (packages/themes/scripts/generate-brand-card-font
 * .mjs), hier werden sie zusammengesetzt und das Ergebnis abgelegt.
 *
 * DER SCHLÜSSEL IM PFAD WIRD NICHT ALS EINGABE BENUTZT — das ist die
 * Sicherheitsentscheidung dieser Route. Gerendert wird immer der AKTUELLE Stand
 * des Mandanten, und abgelegt unter dem Schlüssel, der aus DIESEM Stand folgt.
 * Andernfalls könnte ein Bot mit erfundenen Schlüsseln beliebig viele Dateien
 * auf die Platte legen und beliebig oft rechnen lassen. Der Schlüssel in der
 * URL hat genau eine Aufgabe: sich zu ÄNDERN, wenn sich das Erscheinungsbild
 * ändert — nur so holen Vorschau-Dienste ein neues Bild (sie merken sich eines
 * pro URL, oft für Wochen). Ein veralteter Schlüssel bekommt deshalb das
 * aktuelle Bild statt eines 404: das ist die freundlichere Antwort für einen
 * Link, der schon in einem Chat steht.
 *
 * Kontroll-Hosts (my./start.) dürfen hier durch: `/og/*` ist keine `/api/`-Route
 * (01.control-center.ts greift nicht) und liefert dort App-Brand + Default-Farbe
 * — dieselbe Antwort wie `/favicon.svg`. Unbekannte Hosts hat `00.tenant.ts`
 * längst mit 404 erledigt.
 */
export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'key') ?? ''
  const requested = param.endsWith('.png') ? param.slice(0, -4) : ''
  if (!BRAND_CARD_KEY_PATTERN.test(requested)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const mark = await resolveTenantBrandMark(event)
  const appConfig = useAppConfig() as { pukalani?: { brand?: { name?: string } } }
  // Die Wortmarke ist BEWUSST der Betreiber-Name und nicht der Host: sie ist
  // die eine kleine Stelle, an der Pukalani auf einer Kunden-Karte steht.
  //
  // AUSSER auf unseren eigenen Karten: dort IST der Betreiber-Name schon der
  // Titel (`useBrandName()` fällt darauf zurück, wenn keine Community
  // dahintersteht — Kontroll-Hosts, und jede Community ohne eigenen Namen).
  // Dieselbe Zeile zweimal übereinander sieht nicht nach Absender aus, sondern
  // nach Fehler.
  const wordmark = appConfig.pukalani?.brand?.name ?? ''
  const key = brandCardKey(mark.color, mark.name)
  const png = await brandCardPng(key, {
    color: mark.color,
    name: mark.name,
    wordmark: wordmark === mark.name ? '' : wordmark,
  })

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'content-length', png.length)
  // Der Schlüssel steckt im Pfad und wandert bei jeder Änderung → die einzelne
  // URL ist unveränderlich und darf ewig liegen bleiben. Genau das ist der
  // Grund, warum diese Route die Maschine nichts kostet: sie wird pro
  // Community und Vorschau-Dienst ein einziges Mal wirklich abgerufen.
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  return png
})

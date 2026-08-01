// Layer-Code explizit relativ (wie favicon.svg.get.ts): die APP verdrahtet
// Themes-Bildmarke und Mandanten-Kontext zu einer Antwort.
import {
  BRAND_ICON_DEFAULT_SIZE,
  BRAND_ICON_KEY_PATTERN,
  brandIconKey,
  isBrandIconSize,
  type BrandIconSize,
} from '../../../../../packages/themes/shared/brandIcon'
import { resolveTenantBrandMark } from '../../utils/tenantBrandMark'
import { brandIconPng } from '../../utils/brandImageStore'

/**
 * Das App-Icon EINER Community für den Home-Bildschirm (OPEN-ITEMS C7):
 * `/icon/<key>.png` (512×512) und `?size=180` für Apples `apple-touch-icon`.
 * Randlose Kachel in der Basisfarbe des Community-Themes + Initiale.
 *
 * PNG, nicht SVG: iOS akzeptiert als `apple-touch-icon` ausschließlich
 * Bitmaps — aus `/favicon.svg` lässt sich das nicht ableiten. Ohne diese Route
 * legt iOS einen Screenshot der Seite auf den Home-Bildschirm. Gerastert wird
 * wie die Vorschau-Karte ohne Renderer im Betrieb (brandIconPng.ts).
 *
 * DER SCHLÜSSEL IM PFAD WIRD NICHT ALS EINGABE BENUTZT — dieselbe
 * Sicherheitsentscheidung wie bei `/og/<key>.png`. Gezeichnet wird immer der
 * AKTUELLE Stand des Mandanten; der Schlüssel hat genau eine Aufgabe: sich zu
 * ÄNDERN, wenn sich das Erscheinungsbild ändert, damit Geräte ihr gemerktes
 * Icon verwerfen. Ein veralteter Schlüssel bekommt deshalb das aktuelle Icon
 * statt eines 404 — auf einem Home-Bildschirm steht die URL womöglich seit
 * Monaten. Die GRÖSSE ist dagegen echte Eingabe und deshalb auf die zwei
 * ausgelieferten Maße beschränkt (BRAND_ICON_SIZES): ohne diesen Riegel
 * könnte ein Bot mit erfundenen Größen beliebig rechnen lassen.
 *
 * KEINE SICHTBARKEITS-SPERRE (bewusst, anders als bei `/og/<key>.png`): eine
 * Community „nur für Mitglieder" hat kein Vorschaubild, weil das ihren Namen
 * und ihre Farbe ungefragt in fremde Chats und Timelines trägt (C18). Ein
 * App-Icon tut das Gegenteil — es entsteht nur, wenn ein MITGLIED die Seite
 * selbst auf seinen Home-Bildschirm legt, und es liegt danach ausschließlich
 * auf dessen Gerät. Es trägt keinen Inhalt nach außen, und es zu sperren
 * hieße, genau den treuesten Mitgliedern eine graue Kachel zu geben.
 *
 * Kontroll-Hosts (my./start.) dürfen hier durch: `/icon/*` ist keine
 * `/api/`-Route (01.control-center.ts greift nicht) und liefert dort App-Brand
 * + Default-Farbe — dieselbe Antwort wie `/favicon.svg`. Unbekannte Hosts hat
 * `00.tenant.ts` längst mit 404 erledigt.
 */
export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'key') ?? ''
  const requested = param.endsWith('.png') ? param.slice(0, -4) : ''
  if (!BRAND_ICON_KEY_PATTERN.test(requested)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const wanted = getQuery(event).size
  if (wanted !== undefined && !isBrandIconSize(wanted)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
  const size: BrandIconSize = wanted === undefined ? BRAND_ICON_DEFAULT_SIZE : Number(wanted) as BrandIconSize

  const mark = await resolveTenantBrandMark(event)
  const png = await brandIconPng(brandIconKey(mark.color, mark.name), {
    color: mark.color,
    name: mark.name,
    size,
  })

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'content-length', png.length)
  // Der Schlüssel steckt im Pfad und wandert bei jeder Änderung → die einzelne
  // URL ist unveränderlich und darf ewig liegen bleiben.
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  return png
})

/**
 * Schutzwall des Kundenbereichs (Kontroll-Host, s. 00.tenant.ts).
 *
 * Auf einem Kontroll-Host gibt es KEINEN Mandanten. Das ist gewollt — dort wird
 * eine Community erst angelegt —, hat aber eine unangenehme Folge: alle
 * tenant-gescopten Routen (scopeQuery/scopeRow) fallen ohne Kontext auf
 * Single-Tenant-Verhalten zurück und würden UNGESCOPT über das gesamte
 * Pool-Projekt lesen. `app.pukalani.app/api/comments` wäre damit ein Leck über
 * alle Kunden hinweg.
 *
 * Deshalb: nur ausdrücklich erlaubte API-Präfixe (maui.tenancy.controlApiPrefixes),
 * alles andere 404 — dieselbe Antwort wie ein unbekannter Host, es verrät also
 * nicht einmal, dass es die Route gibt.
 *
 * Muss nach 00.tenant.ts laufen (Namens-Prefix 01.) und VOR allen Routen.
 */
import { isAllowedControlPath } from '../../shared/controlCenter'

export default defineEventHandler((event) => {
  if (!event.context.controlCenter) return

  const appConfig = useAppConfig() as {
    maui?: { tenancy?: { controlApiPrefixes?: string[] } }
  }
  const prefixes = appConfig.maui?.tenancy?.controlApiPrefixes ?? []
  const path = event.path.split('?')[0] ?? ''

  if (!isAllowedControlPath(path, prefixes)) {
    throw createError({ status: 404, statusText: 'Not found' })
  }
})

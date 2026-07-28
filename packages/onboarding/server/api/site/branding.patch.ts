import { z } from 'zod'
import { isBuiltinThemeSelection } from '../../../../themes/shared/builtinThemes'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'

/**
 * Erscheinungsbild DIESER Community wählen (Davids Entscheidung 12 vom
 * 2026-07-28: Site-Owner bestimmen Theme + Variante selbst). Aufrufer ist das
 * Kunden-Dashboard auf dem Mandanten-Host (Abschnitt „Erscheinungsbild" in
 * /dashboard/settings/community).
 *
 * GLEICHE KETTE WIE DER REGISTRIERUNGS-SCHALTER (S1), und aus demselben Grund:
 * `tenants` gehört dem Control Plane, die Platform-App hat dorthin nur einen
 * READ-ONLY-Key. Der einzige vorgesehene Schreibkanal ist die Service-Naht
 * dieses Layers (utils/controlPlane.ts: Secret + JWT). Siehe den
 * Gegenkommentar in packages/control/server/api/control/site/branding.post.ts.
 *
 * AUTORISIERUNG: `requireSitePermission(event, 'branding.manage')` — die
 * Capability steht seit G1 in der Site-Rollen-Matrix (owner + admin,
 * core/shared/tenantAuthz.ts) und hatte bis heute kein Ziel. Das hier ist ihr
 * Ziel. NIE `requirePermission`: die ist synchron und für Betreiber-Routen.
 *
 * WIRKSAMKEIT: der Tenant-Resolver der Platform-App cacht die Host-Auflösung
 * 30 s (createTenantsTableResolver, Microcache — positiv wie negativ). Die
 * gerenderte Community trägt die neue Farbe deshalb erst nach ≤30 s. Damit das
 * DASHBOARD nicht 30 s lang das Alte behauptet, gibt diese Route den
 * geschriebenen Wert zurück und die Seite übernimmt ihn aus der ANTWORT
 * (Muster registration.patch.ts).
 */
const bodySchema = z.object({
  /** Built-in-Katalog-Key (themeRegistry) oder '' = Instanz-Einstellung. */
  theme: z.string().max(32),
  /** Tonale Variante DIESES Themes oder '' = Basisfarbe. */
  variant: z.string().max(32),
}).strict().refine(
  value => isBuiltinThemeSelection(value.theme, value.variant),
  { message: 'Unknown theme or variant' },
)

export default defineEventHandler(async (event) => {
  await requireSitePermission(event, 'branding.manage')

  // Ohne Mandanten-Kontext gibt es keine Community, deren Erscheinung man
  // wählen könnte (Silo-App, Kontroll-Host, Single-Tenant). 404 wie eine
  // fehlende Route — dort gehört die Optik der Instanz, nicht einer Site.
  const tenant = useTenant(event)
  if (!tenant?.siteId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  const jwt = await mintRuntimeJwt(event)

  // siteId kommt aus dem SERVER-Kontext (Host-Auflösung), nie aus dem Body —
  // sonst könnte ein durchgereichter Wert eine fremde Community umfärben.
  return await callControlPlane<{ siteId: string, theme: string, variant: string }>(
    event,
    '/api/control/site/branding',
    { jwt, siteId: tenant.siteId, theme: body.theme, variant: body.variant },
  )
})

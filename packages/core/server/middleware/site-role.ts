/**
 * Site-Rollen-Auflösung fürs Seiten-SSR (Audit-Befund N1) — läuft alphabetisch
 * NACH auth.ts (user) und 00.tenant.ts (tenant).
 *
 * Warum diese Middleware existiert: das Kunden-Dashboard hängt client- UND
 * SSR-seitig an Capabilities. Operator-Labels reisen mit dem User in den
 * Client — die Site-Rolle (site_members, G1) lebt aber nur im Control Plane.
 * Diese Middleware löst sie einmal pro Seiten-Request auf (derselbe Resolver
 * wie requireTenantPermission, gleicher 30-s-Cache → Rollen-Entzug greift im
 * UI nach ≤30 s, dokumentiert akzeptiert) und legt sie in event.context.
 * Der App-Plugin tenant-brand.server.ts spiegelt von dort NUR den
 * Rollen-String in den Payload.
 *
 * BEWUSST NUR Seiten-SSR: /api/*-Routen autorisieren selbst
 * (requireSitePermission/requireTenantPermission, fail-closed) — eine
 * Vorab-Auflösung dort wäre doppelt. Interne Pfade (/_nuxt, /_i18n, …)
 * brauchen nie eine Rolle.
 *
 * Fail-closed: jeder Zweifel (kein User, kein Tenant, kein Resolver,
 * Resolver-Fehler) ⇒ keine Rolle (undefined/null) — nie ein 500 fürs SSR.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const tenant = event.context.tenant
  if (!user?.$id || !tenant?.siteId) return

  const path = event.path.split('?')[0] ?? ''
  if (path.startsWith('/api/') || path.startsWith('/_')) return

  try {
    event.context.siteRole = await resolveTenantRole(event)
  }
  catch {
    // Transienter Resolver-Fehler: keine Rolle für DIESEN Request (die UI
    // zeigt dann das Operator-/Gast-Bild); die Server-Routen bleiben die
    // Autorität und retryen beim nächsten Aufruf sofort.
    event.context.siteRole = null
  }
})

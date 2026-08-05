/**
 * Community-Rollen-Auflösung fürs Seiten-SSR (Audit-Befund N1) — läuft nach
 * Dateiname NACH 00.tenant.ts (tenant), 02.auth.ts (user) und
 * 06.community-label.ts (Label). Die Zahl-Präfixe sind seit E8-4 Pflicht: Nitro
 * sortiert die Middleware lexikografisch, und ohne sie hätte die Umbenennung
 * `site-role` → `community-role` diese Prüfung VOR csrf-origin und rate-limit
 * geschoben.
 *
 * Warum diese Middleware existiert: das Kunden-Dashboard hängt client- UND
 * SSR-seitig an Capabilities. Operator-Labels reisen mit dem User in den
 * Client — die Community-Rolle (community_members, G1) lebt aber nur im Control Plane.
 * Diese Middleware löst sie einmal pro Seiten-Request auf (derselbe Resolver
 * wie requireCommunityPermission, gleicher 30-s-Cache → Rollen-Entzug greift im
 * UI nach ≤30 s, dokumentiert akzeptiert) und legt sie in event.context.
 * Der App-Plugin tenant-brand.server.ts spiegelt von dort NUR den
 * Rollen-String in den Payload.
 *
 * BEWUSST NUR Seiten-SSR: /api/*-Routen autorisieren selbst
 * (requireCommunityPermission, fail-closed) — eine
 * Vorab-Auflösung dort wäre doppelt. Interne Pfade (/_nuxt, /_i18n, …)
 * brauchen nie eine Rolle.
 *
 * Fail-closed: jeder Zweifel (kein User, kein Tenant, kein Resolver,
 * Resolver-Fehler) ⇒ keine Rolle (undefined/null) — nie ein 500 fürs SSR.
 */
export default defineEventHandler(async (event) => {
  const user = event.context.user
  const tenant = event.context.tenant
  if (!user?.$id || !tenant?.communityId) return

  const path = event.path.split('?')[0] ?? ''
  if (path.startsWith('/api/') || path.startsWith('/_')) return

  try {
    event.context.communityRole = await resolveCommunityRole(event)
  }
  catch {
    // Transienter Resolver-Fehler: keine Rolle für DIESEN Request (die UI
    // zeigt dann das Operator-/Gast-Bild); die Server-Routen bleiben die
    // Autorität und retryen beim nächsten Aufruf sofort.
    event.context.communityRole = null
  }

  /**
   * Die Vertrauensstufe kommt hier mit (F1 Teilpaket 3), und zwar aus demselben
   * Grund wie die Rolle: seit diesem Teilpaket hängen drei Capabilities an ihr,
   * und die Oberfläche blendet Knöpfe nach Capabilities aus. Ohne den Spiegel
   * sähe eine Stufe 4 ihre Werkzeuge nicht — die Route ließe sie durch, aber
   * niemand fände den Knopf.
   *
   * KEIN eigener try/catch: `resolveTrustLevel` wirft nie und antwortet im
   * Zweifel mit 0. Und keine zusätzliche Last im Normalfall — die
   * Implementierung im posts-Layer cacht je (Community, Mensch), genau wie der
   * Rollen-Resolver.
   */
  event.context.communityTrustLevel = await resolveTrustLevel(event)
})

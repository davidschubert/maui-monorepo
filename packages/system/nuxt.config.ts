/**
 * Fundament-Layer: die cross-cutting Infrastruktur-Tabellen. Er BESITZT ihr
 * Schema — `audit_logs`, `app_config`, `notifications`, `activities`,
 * `custom_themes`, `custom_fonts` (+ Storage-Bucket `fonts`), `app_secrets`
 * und `community_branding`. Konsumenten sind core (Auth-Audit, Config,
 * Benachrichtigungen, Aktivitäten) und admin (Audit-/Config-UI).
 *
 * NICHT hier: `changelog` gehört dem admin-Layer
 * (packages/admin/scripts/migrations/001-changelog.ts). Presence läuft über die
 * Appwrite Presences-API — dafür gibt es keine Table mehr.
 *
 * Löst die frühere core→admin-Inversion (CONCEPT A14): diese Tabellen gehörten
 * zuvor dem admin-Produkt-Layer, von dem core funktional abhing.
 *
 * SCHWERPUNKT Migrationen, aber NICHT nur (nachgezogen 2026-08-02): der Layer
 * liefert zusätzlich zwei bewusst öffentliche Lese-Routen zu seinen
 * INSTANZWEITEN Tabellen (`/api/themes`, `/api/fonts` — read(any), kein
 * Mandanten-Scope, deshalb bewusst außerhalb der Datentür) sowie den
 * GDPR-Contributor für `notifications`/`activities`/`audit_logs`
 * (server/plugins/user-data.ts). Der Kopf behauptete bis heute „kein
 * App-/Server-Code, nur Migrationen" — das stimmte, seit der Contributor
 * dazukam, nicht mehr und schickte jeden auf die falsche Fährte, der
 * /api/themes suchte.
 */
export default defineNuxtConfig({})

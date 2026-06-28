/**
 * Fundament-Layer: System-Infrastruktur-Tabellen (`audit_logs`, `app_config`,
 * `notifications`, `presence`). Besitzt NUR das Schema dieser cross-cutting
 * Tables — Konsumenten sind core (Auth-Audit, Config, Notifications, Presence)
 * und admin (Audit-/Config-UI). Löst die frühere core→admin-Inversion
 * (CONCEPT A14): diese Tabellen gehörten zuvor dem admin-Feature-Layer, von dem
 * core funktional abhing.
 *
 * Kein App-/Server-Code, nur Migrationen — ein reiner Schema-Owner.
 */
export default defineNuxtConfig({})

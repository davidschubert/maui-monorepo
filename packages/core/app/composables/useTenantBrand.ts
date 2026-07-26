/**
 * Anzeigename des aktuellen Mandanten (SSR-gespiegelt via tenant-brand-
 * Plugin, reist im Payload). null = kein Tenant-Host (Silo-App, Control-
 * Host) — Konsumenten fallen auf maui.brand.name zurück.
 */
export function useTenantBrand() {
  return useState<string | null>('maui-tenant-brand', () => null)
}

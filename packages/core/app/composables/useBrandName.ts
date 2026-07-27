/**
 * Anzeigename, den der Besucher sieht (Header, Footer, Seitentitel):
 * Tenant-Name (Pool-Host, z. B. „Morgenlicht") vor App-Brand
 * (maui.brand.name) vor dem historischen „Maui"-Fallback.
 *
 * EINE Kette für alle Konsumenten — vorher stand sie pro Layout dupliziert
 * im Template, und die Auth-Seiten hatten sie gar nicht (Audit-Befund B3).
 */
export function useBrandName() {
  const tenantBrand = useTenantBrand()
  const appConfig = useAppConfig()
  return computed<string>(() => tenantBrand.value ?? appConfig.maui?.brand?.name ?? 'Maui')
}

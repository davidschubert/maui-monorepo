/**
 * Anzeigename, den der Besucher sieht (Header, Footer, Seitentitel):
 * Tenant-Name (Pool-Host, z. B. „Morgenlicht") vor App-Brand
 * (pukalani.brand.name) vor dem Fallback „Pukalani".
 *
 * EINE Kette für alle Konsumenten — vorher stand sie pro Layout dupliziert
 * im Template, und die Auth-Seiten hatten sie gar nicht (Audit-Befund B3).
 */
export function useBrandName() {
  const tenantBrand = useTenantBrand()
  const appConfig = useAppConfig()
  return computed<string>(() => tenantBrand.value ?? appConfig.pukalani?.brand?.name ?? 'Pukalani')
}

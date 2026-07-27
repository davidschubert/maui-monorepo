/**
 * Tenant-Branding → Client (P3, 2026-07-26): Der Tenant-Kontext lebt nur in
 * event.context (Server). Der öffentliche Header der Community-Hosts braucht
 * aber den Anzeigenamen des Mandanten („Morgenlicht" statt App-Brand) —
 * dieser Server-Plugin spiegelt ihn einmalig in einen useState, der über den
 * Nuxt-Payload zum Client reist. Kein Tenant (Silo/Control-Host) → null,
 * der Header fällt auf maui.brand.name zurück.
 *
 * SPIEGEL-INVENTAR (Audit-Befund K5 — beim Erweitern mitpflegen!): dieser
 * State reist im __NUXT__-Payload JEDER Seite mit, auch unauthentifiziert.
 * Es wird deshalb GENAU gespiegelt, was clientseitig gelesen wird:
 *   - `name` → useTenantBrand() → useBrandName() (öffentlicher Header)
 *   - `plan` → useTenantPlan().planAllows() (Produkt-Sichtbarkeit in Nav/Badges)
 * NICHT gespiegelt (kein Client-Leser): projectId, tenantId, siteId, limits,
 * mode, theme/variant (die reisen als <html>-Attribute, nicht als Daten).
 * Neues Feld hier hinein nur MIT nachgewiesenem Client-Leser.
 */
export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const tenant = event?.context.tenant
  useState<string | null>('maui-tenant-brand', () => tenant?.name ?? null)
  // Plan zusätzlich (P4): das UI blendet Produkte aus, die der Plan nicht
  // enthält (Nav/Badges) — die AUTORITÄT bleibt requirePlanProduct auf den
  // Server-Routen. null = kein Pool-Tenant → UI zeigt alles.
  useState<string | null>('maui-tenant-plan', () => (tenant?.mode === 'pool' ? tenant.plan ?? null : null))
  // Zugangsregel der Community (S1): schließt die Register-Seite und zeigt
  // stattdessen den „nur auf Einladung"-Hinweis. Auch hier ist die AUTORITÄT
  // serverseitig (assertTenantRegistrationOpen an den Auth-Routen) — dieser
  // Wert ist nur die Ansage an den Besucher. null = kein Tenant-Host.
  useState<boolean | null>('maui-tenant-open-registration', () => (
    tenant ? tenant.openRegistration !== false : null
  ))
})

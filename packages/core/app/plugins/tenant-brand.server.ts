/**
 * Tenant-Branding → Client (P3, 2026-07-26): Der Tenant-Kontext lebt nur in
 * event.context (Server). Der öffentliche Header der Community-Hosts braucht
 * aber den Anzeigenamen des Mandanten („Morgenlicht" statt App-Brand) —
 * dieser Server-Plugin spiegelt ihn einmalig in einen useState, der über den
 * Nuxt-Payload zum Client reist. Kein Tenant (Silo/Control-Host) → null,
 * der Header fällt auf maui.brand.name zurück.
 *
 * Bewusst NUR der Name — projectId/tenantId/plan bleiben serverseitig.
 */
export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const tenant = event?.context.tenant
  useState<string | null>('maui-tenant-brand', () => tenant?.name ?? null)
})

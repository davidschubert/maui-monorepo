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
 *   - `siteRole` → useSiteRole()/useSiteCapability() (Dashboard-Zugang + Nav,
 *     N1) — NUR der Rollen-String des EINGELOGGTEN Users auf DIESEM Mandanten
 *     (server/middleware/site-role.ts); Gäste bekommen null. Die Capabilities
 *     werden clientseitig aus der geteilten Matrix (shared/tenantAuthz)
 *     abgeleitet — es reist kein fremdes Datum mit.
 *   - `theme`/`variant` → useTenantBranding() (Entscheidung 12, 2026-07-28):
 *     der Erscheinungsbild-Abschnitt in /dashboard/settings/community zeigt
 *     die GESETZTE Wahl der Community. Bis dahin gab es dafür keinen
 *     Client-Leser (die Werte reisten nur als <html>-Attribute) — mit dem
 *     Kunden-Picker gibt es einen, und das Inventar wächst mit. Beide Werte
 *     sind ohnehin öffentlich sichtbar: sie STEHEN als data-theme/data-variant
 *     im HTML jeder Seite.
 *   - `tenantId` → useTenantId(), gelesen von usePresence() und dem
 *     Activity-Realtime-Stream (useActivityFeed, C1b): der Client-
 *     Presence-Leser holt die Presencen DIREKT von Appwrite (Cookie-GET +
 *     Realtime), und im Pool liegen dort die Anwesenden ALLER Communities in
 *     EINEM Raum. Ohne den Mandanten kann er fremde nicht aussortieren —
 *     `useViewingPresence` zeigte sonst „N sehen diese Seite" mit den Namen
 *     fremder Kunden (metadata.page ist auf jedem Mandanten derselbe String).
 *     Kein Geheimnis: die Id benennt die Site, auf der der Besucher ohnehin
 *     steht, und trägt für sich genommen keine Daten. Der Activity-Feed
 *     (C1b) ist der ZWEITE Leser derselben Sorte: sein Realtime-Stream
 *     abonniert die `activities`-Rows direkt, und wer in zwei Communities
 *     Mitglied ist, trägt beide Site-Labels — ohne Filter erschienen fremde
 *     Ereignisse im Feed. Die Regel bleibt eng: NUR Leser, die ohne
 *     Server-Route direkt gegen Appwrite lesen, dürfen dazukommen — kein
 *     allgemeiner „aktueller Mandant"-Getter für UI-Logik.
 *   - `siteId` → useSiteId(), gelesen AUSSCHLIESSLICH vom WS-Presence-Upsert
 *     in usePresenceState() (A4, Presence-Grenze): der Browser schreibt seine
 *     eigene Presence per WebSocket und ERSETZT dabei deren Permissions — er
 *     muss also dieselbe Grenze setzen wie der Server (`read("label:<siteId>")`
 *     statt des früheren, pool-weiten `read("users")`). Ohne diesen Wert
 *     schriebe der Client zwischen zwei Heartbeats wieder offene Rechte.
 *     Kein Geheimnis: der eingeloggte Nutzer trägt exakt diese Id als Label in
 *     seinem eigenen Account-Objekt, und sie benennt nur die Site, auf der er
 *     ohnehin steht. Für Gäste ebenfalls harmlos (sie schreiben keine
 *     Presence) — der Wert reist bewusst nicht rollenabhängig.
 * NICHT gespiegelt (kein Client-Leser): projectId, limits, mode.
 * Neues Feld hier hinein nur MIT nachgewiesenem Client-Leser.
 */
import type { TenantRole } from '../../shared/tenantAuthz'

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const tenant = event?.context.tenant
  useState<string | null>('maui-tenant-brand', () => tenant?.name ?? null)
  // Plan zusätzlich (P4): das UI blendet Produkte aus, die der Plan nicht
  // enthält (Nav/Badges) — die AUTORITÄT bleibt requirePlanProduct auf den
  // Server-Routen. null = kein Pool-Tenant → UI zeigt alles.
  useState<string | null>('maui-tenant-plan', () => (tenant?.mode === 'pool' ? tenant.plan ?? null : null))
  // Mandanten-Id (B1, C1b): AUSSCHLIESSLICH für die Client-Leser, die DIREKT
  // (ohne Server-Route) gegen Appwrite lesen und deshalb selbst scopen müssen —
  // usePresence() und der Activity-Realtime-Stream, beide über useTenantId().
  // null = kein Pool-Tenant.
  useState<string | null>('maui-tenant-id', () => (tenant?.mode === 'pool' ? tenant.tenantId : null))
  // Site-Id (A4): der Label-Schlüssel für die Permissions des WS-Presence-
  // Upserts. NUR im Pool — im Silo schreibt der Client weiter read("users").
  useState<string | null>('maui-site-id', () => (tenant?.mode === 'pool' ? tenant.siteId ?? null : null))
  // Zugangsregel der Community (S1): schließt die Register-Seite und zeigt
  // stattdessen den „nur auf Einladung"-Hinweis. Auch hier ist die AUTORITÄT
  // serverseitig (assertTenantRegistrationOpen an den Auth-Routen) — dieser
  // Wert ist nur die Ansage an den Besucher. null = kein Tenant-Host.
  useState<boolean | null>('maui-tenant-open-registration', () => (
    tenant ? tenant.openRegistration !== false : null
  ))
  // Erscheinungsbild der Community (Entscheidung 12): die GESETZTE Wahl, nicht
  // die aufgelöste — '' heißt „nichts gewählt, Instanz-Einstellung gilt" und
  // muss im Dashboard als solches erkennbar bleiben. null = kein Tenant-Host.
  useState<{ theme: string, variant: string } | null>('maui-tenant-branding', () => (
    tenant ? { theme: tenant.theme ?? '', variant: tenant.variant ?? '' } : null
  ))
  // Site-Rolle des eingeloggten Users (N1): EXPLIZITE Zuweisung statt
  // Init-Funktion — der Auth-Store (läuft früher) initialisiert denselben
  // Key bereits mit null; eine Init-Funktion würde hier still verpuffen.
  const siteRole = useState<TenantRole | null>('maui-site-role', () => null)
  siteRole.value = event?.context.siteRole ?? null
})

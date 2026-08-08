/**
 * Tenant-Branding → Client (P3, 2026-07-26): Der Tenant-Kontext lebt nur in
 * event.context (Server). Der öffentliche Header der Community-Hosts braucht
 * aber den Anzeigenamen des Mandanten („Morgenlicht" statt App-Brand) —
 * dieser Server-Plugin spiegelt ihn einmalig in einen useState, der über den
 * Nuxt-Payload zum Client reist. Kein Tenant (Silo/Control-Host) → null,
 * der Header fällt auf pukalani.brand.name zurück.
 *
 * SPIEGEL-INVENTAR (Audit-Befund K5 — beim Erweitern mitpflegen!): dieser
 * State reist im __NUXT__-Payload JEDER Seite mit, auch unauthentifiziert.
 * Es wird deshalb GENAU gespiegelt, was clientseitig gelesen wird:
 *   - `name` → useTenantBrand() → useBrandName() (öffentlicher Header)
 *   - `plan` → useTenantPlan().planAllows() (Produkt-Sichtbarkeit in Nav/Badges)
 *   - `communityRole` → useCommunityRole()/useCommunityCapability() (Dashboard-Zugang + Nav,
 *     N1) — NUR der Rollen-String des EINGELOGGTEN Users auf DIESEM Mandanten
 *     (server/middleware/07.community-role.ts); Gäste bekommen null. Die Capabilities
 *     werden clientseitig aus der geteilten Matrix (shared/communityAuthz)
 *     abgeleitet — es reist kein fremdes Datum mit.
 *   - `communityTrustLevel` → useCommunityRole()/useCommunityCapability()
 *     (F1 Teilpaket 3, 2026-08-04): EINE Zahl 0–4, die EIGENE Stufe des
 *     eingeloggten Menschen auf diesem Mandanten. Sie reist aus demselben Grund
 *     mit wie der Rollen-String — seit diesem Teilpaket hängen drei
 *     Capabilities an ihr, und ohne den Spiegel sähe eine Stufe 4 ihre
 *     Werkzeuge nicht. Kein fremdes Datum, kein Geheimnis: die eigene Stufe
 *     steht ohnehin in der Abzeichen-Galerie dieses Menschen. Gäste bekommen 0.
 *   - `audience` → useTenantAudience() (C18, 2026-07-30): zwei Leser, und beide
 *     brauchen ihn SSR-fest. (1) useLocaleSeoHead() stempelt auf
 *     'members'-Communities `noindex, nofollow` — ein Crawler liest das
 *     SSR-HTML, ein Client-Nachtrag käme zu spät. (2) der Schalter in
 *     /dashboard/community zeigt den gesetzten Zustand. Kein
 *     Geheimnis: ob eine Community öffentlich lesbar ist, beantwortet jeder
 *     Gast-Abruf ihrer Startseite ohnehin.
 *   - `theme`/`variant`/`neutral` → useTenantBranding() (Entscheidung 12, 2026-07-28;
 *     `neutral` seit 2026-07-29, Rest von B5):
 *     die Seite /dashboard/community/branding (seit F5 eine eigene Fläche,
 *     davor eine Karte in den Community-Einstellungen) zeigt
 *     die GESETZTE Wahl der Community. Bis dahin gab es dafür keinen
 *     Client-Leser (die Werte reisten nur als <html>-Attribute) — mit dem
 *     Kunden-Picker gibt es einen, und das Inventar wächst mit. Alle drei Werte
 *     sind ohnehin öffentlich sichtbar: sie STEHEN als
 *     data-theme/data-variant/data-neutral im HTML jeder Seite.
 *     Seit D6 (2026-08-01) ist dieser State auch ein SCHREIB-Ziel zur Laufzeit:
 *     realtime-branding.client.ts überschreibt ihn, wenn die Spiegel-Row
 *     `community_branding/<communityId>` sich ändert — damit morpht ein
 *     Farbwechsel offene Fenster ohne Reload. Der SSR-Wert hier bleibt die
 *     Wahrheit für jeden neuen Seitenaufbau.
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
 *     Ereignisse im Feed. Die NotificationBell (C15) ist der DRITTE: ihr
 *     Realtime-Strom abonniert `notifications` direkt, und eine Zeile kommt
 *     dort an, weil sie dem EMPFÄNGER gehört — nicht weil sie zu diesem Host
 *     gehört. Ohne Filter blendete sie live eine Meldung aus Community B in
 *     der Glocke von A ein, die der nächste Reload wieder entfernt (die
 *     Leseroute filtert serverseitig). Der VIERTE (Audit 2026-08-02) ist der
 *     `comments`-Strom der Dashboard-Übersicht (admin, app/pages/dashboard/
 *     index.vue): er zieht Kennzahlen, Analyse und gemeldete Kommentare live
 *     nach und lauschte dafür pool-weit — jeder fremde Kommentar einer
 *     öffentlichen Community löste in JEDEM Kunden-Dashboard drei Refetches
 *     aus. Die Regel bleibt eng: NUR Leser, die
 *     ohne Server-Route direkt gegen Appwrite lesen, dürfen dazukommen — kein
 *     allgemeiner „aktueller Mandant"-Getter für UI-Logik.
 *   - `communityId` → useSiteId(), gelesen AUSSCHLIESSLICH vom WS-Presence-Upsert
 *     in usePresenceState() (A4, Presence-Grenze): der Browser schreibt seine
 *     eigene Presence per WebSocket und ERSETZT dabei deren Permissions — er
 *     muss also dieselbe Grenze setzen wie der Server (`read("label:<communityId>")`
 *     statt des früheren, pool-weiten `read("users")`). Ohne diesen Wert
 *     schriebe der Client zwischen zwei Heartbeats wieder offene Rechte.
 *     Kein Geheimnis: der eingeloggte Nutzer trägt exakt diese Id als Label in
 *     seinem eigenen Account-Objekt, und sie benennt nur die Site, auf der er
 *     ohnehin steht. Für Gäste ebenfalls harmlos (sie schreiben keine
 *     Presence) — der Wert reist bewusst nicht rollenabhängig.
 * NICHT gespiegelt (kein Client-Leser): projectId, limits, mode.
 * Neues Feld hier hinein nur MIT nachgewiesenem Client-Leser.
 */
import type { CommunityRole } from '../../shared/communityAuthz'
import type { TrustLevel } from '../../shared/trustLevel'
import { communityAudienceFor } from '../../shared/communityAudience'
import type { CommunityAudience } from '../../shared/types/tenant'

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()
  const tenant = event?.context.tenant
  useState<string | null>('pukalani-tenant-brand', () => tenant?.name ?? null)
  // Plan zusätzlich (P4): das UI blendet Produkte aus, die der Plan nicht
  // enthält (Nav/Badges) — die AUTORITÄT bleibt requirePlanProduct auf den
  // Server-Routen. null = kein Pool-Tenant → UI zeigt alles.
  useState<string | null>('pukalani-tenant-plan', () => (tenant?.mode === 'pool' ? tenant.plan ?? null : null))
  // Mandanten-Id (B1, C1b, C15): AUSSCHLIESSLICH für die Client-Leser, die
  // DIREKT (ohne Server-Route) gegen Appwrite lesen und deshalb selbst scopen
  // müssen — usePresence(), der Activity-Realtime-Stream und der
  // Realtime-Filter der NotificationBell, alle über useTenantId().
  // null = kein Pool-Tenant.
  useState<string | null>('pukalani-tenant-id', () => (tenant?.mode === 'pool' ? tenant.tenantId : null))
  // Site-Id (A4): der Label-Schlüssel für die Permissions des WS-Presence-
  // Upserts. NUR im Pool — im Silo schreibt der Client weiter read("users").
  useState<string | null>('pukalani-site-id', () => (tenant?.mode === 'pool' ? tenant.communityId ?? null : null))
  // Zugangsregel der Community (S1): schließt die Register-Seite und zeigt
  // stattdessen den „nur auf Einladung"-Hinweis. Auch hier ist die AUTORITÄT
  // serverseitig (assertTenantRegistrationOpen an den Auth-Routen) — dieser
  // Wert ist nur die Ansage an den Besucher. null = kein Tenant-Host.
  useState<boolean | null>('pukalani-tenant-open-registration', () => (
    tenant ? tenant.openRegistration !== false : null
  ))
  // Lese-Publikum der Community (C18): 'members' schaltet die Suchmaschinen-
  // Ansage auf noindex und blendet im Dashboard den gesetzten Zustand ein.
  // null = kein Tenant-Host (Silo, Kontroll-Host, Playground) — dort gibt es
  // keine Community-Grenze, es bleibt bei „öffentlich wie bisher".
  useState<CommunityAudience | null>('pukalani-tenant-audience', () => (
    tenant ? communityAudienceFor(tenant) : null
  ))
  // Erscheinungsbild der Community (Entscheidung 12; `neutral` seit dem
  // 2026-07-29, Rest von B5): die GESETZTE Wahl, nicht die aufgelöste — '' heißt
  // „nichts gewählt, Instanz-Einstellung gilt" und muss im Dashboard als solches
  // erkennbar bleiben. `?? ''` fängt zugleich Bestands-Rows, die die Spalte noch
  // nicht tragen (Appwrite backfillt Defaults nicht). null = kein Tenant-Host.
  useState<{ theme: string, variant: string, neutral: string } | null>('pukalani-tenant-branding', () => (
    tenant ? { theme: tenant.theme ?? '', variant: tenant.variant ?? '', neutral: tenant.neutral ?? '' } : null
  ))
  // Site-Rolle des eingeloggten Users (N1): EXPLIZITE Zuweisung statt
  // Init-Funktion — der Auth-Store (läuft früher) initialisiert denselben
  // Key bereits mit null; eine Init-Funktion würde hier still verpuffen.
  const communityRole = useState<CommunityRole | null>('pukalani-community-role', () => null)
  communityRole.value = event?.context.communityRole ?? null
  // Vertrauensstufe (F1 Teilpaket 3) — dieselbe Bauart und derselbe Zweck wie
  // die Rolle eine Zeile darüber: die UI leitet daraus Capabilities ab
  // (useCommunityRole), die Autorität bleibt die Server-Route.
  const communityTrustLevel = useState<TrustLevel>('pukalani-community-trust-level', () => 0)
  communityTrustLevel.value = event?.context.communityTrustLevel ?? 0
})

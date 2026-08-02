/**
 * ── DARF DIESE APP EINE REALTIME-VERBINDUNG AUFBAUEN? (F14, 2026-08-01) ──────
 *
 * EINE pure Regel für alle Realtime-Einstiege des Core (Row-Streams, Presence,
 * Account-WS). Sie beantwortet zwei Fragen auf einmal, weil beide dasselbe
 * bedeuten — „hier gibt es nichts zu abonnieren":
 *
 * 1. DAS CONFIG-GATE `pukalani.realtime.enabled` (Core-Default AN). Apps, die
 *    bewusst keine lebende Datenebene haben — die Marketing-Startseite, die
 *    Hilfe-Site — schalten es aus. Ohne das Gate erbte JEDE App, die core
 *    erweitert, das Config-Plugin (`realtime-config.client.ts`): eine statische,
 *    kontenlose Landingpage lud das 76-kB-Web-SDK nach und öffnete einen
 *    Gast-WebSocket, um `app_config`-Flags zu abonnieren, die sie nirgends liest.
 * 2. DIE DATENEBENE. Ohne Datenbank-/Tabellen-Id (bzw. ohne Endpoint/Projekt
 *    beim Account-WS) wirft der SDK-Kanalbau „Channel ID is required" — in
 *    einem PLUGIN wird daraus ein fataler App-Start-Fehler (Live-Vorfall
 *    2026-07-29: help.pukalani.app lieferte sauberes SSR-HTML, und der Browser
 *    malte eine 500-Seite darüber).
 *
 * WARUM DEFAULT AN, wo der Core sonst jedes Gate ausschaltet: Realtime ist kein
 * Zusatz, den eine App anschaltet, sondern das BESTEHENDE Verhalten jeder
 * Produkt-App (Kommentare, Presence, Live-Branding). Ein Default AUS würde sie
 * alle stillschweigend entkoppeln — und der Ausfall wäre unsichtbar (die Seite
 * sieht richtig aus, sie aktualisiert sich nur nicht mehr). Ein überflüssiger
 * Socket ist ein Kostenfehler, eine fehlende Live-Aktualisierung ein
 * Produktfehler; deshalb muss die stillere Wahl die AUSDRÜCKLICHE sein.
 *
 * `enabled !== false` statt `=== true`: fehlt der Schlüssel (Test ohne
 * App-Config, App mit `realtime: {}`), gilt der Core-Default.
 */
export function realtimeAllowed(
  enabled: boolean | undefined,
  ...requiredIds: (string | undefined)[]
): boolean {
  if (enabled === false) return false
  return requiredIds.every(id => !!id)
}

/**
 * EIGENE DOMAIN JE SILO-WEBSITE — die puren Regeln (control-036, 2026-08-07).
 *
 * ── WAS HIER *NICHT* STEHT, UND WARUM ─────────────────────────────────────
 * Nichts über die FORM einer Domain. Kein zweites `validateCustomDomain`, kein
 * zweites www↔Apex-Paar, kein zweiter TXT-Nachweis, keine zweite
 * Zeige-Prüfung. Das alles steht seit control-035 in `./customDomain.ts` und
 * wird hier IMPORTIERT — dieselbe Datei, dieselben 37 Unit-Tests, dieselbe
 * Sperre für `*.pukalani.app`. Eine zweite Fassung wäre eine zweite Wahrheit
 * darüber, was eine gültige Kundendomain ist, und die beiden würden
 * auseinanderlaufen, sobald jemand eine davon anfasst.
 *
 * Was hier steht, ist ausschließlich das, was an einer WEBSITE-Zeile anders
 * ist als an einer COMMUNITY-Zeile:
 *
 *   1. Woher die Rückfall-Adresse kommt. Eine Community hat `communities.host`
 *      als eigene Spalte; eine Website hat `appUrl` (`https://portfolio.
 *      pukalani.app`) — der Host muss daraus gelesen werden.
 *   2. Dass es KEINEN Plan gibt. Silos sind das Studio-Angebot, Pläne sind
 *      Pool-Sache (CLAUDE.md). `customDomainAllowedForPlan` wird hier bewusst
 *      nicht aufgerufen — nicht „mit true belegt", sondern gar nicht gefragt.
 *   3. Dass die Middleware eine LISTE bekannter Hosts braucht (s. unten).
 */

import {
  canonicalHostFor,
  customDomainForms,
  normalizeCustomDomain,
  resolveCustomDomainStatus,
} from './customDomain'
import type { SiteDomainStatus } from '../../core/shared/types/siteDomain'

/** Der Ausschnitt einer `websites`-Zeile, den diese Rechnungen brauchen. */
export interface SiteDomainRow {
  /** `https://portfolio.pukalani.app` — die Adresse aus dem Register. */
  appUrl?: string | null
  customDomain?: string | null
  customDomainStatus?: string | null
}

/**
 * PURE: die Pukalani-Adresse dieser Website als reiner Hostname.
 *
 * `appUrl` ist eine URL und kein Host — sie trägt Schema und im lokalen
 * Betrieb auch einen Port (`http://localhost:3005`). Genommen wird der
 * HOSTNAME ohne Port, weil genau das im `Host`-Header steht, gegen den die
 * Middleware vergleicht … und weil ein Browser bei `localhost:3005` eben
 * `localhost:3005` schickt. Der Port fällt deshalb an BEIDEN Seiten weg
 * (`normalizeHost` in core macht mit dem Request-Host dasselbe) — sonst
 * träfen sich die beiden nie.
 *
 * '' wenn `appUrl` fehlt oder unlesbar ist. Das ist kein Randfall zum
 * Wegsehen: eine Website ohne `appUrl` hat keine Rückfall-Adresse, und ohne
 * die darf NIE umgeleitet werden — man wüsste sonst nicht, wovon.
 */
export function websiteFallbackHost(appUrl: string | null | undefined): string {
  const raw = (appUrl || '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).hostname.toLowerCase()
  }
  catch {
    // Kein Schema mitgegeben? Dann ist es vielleicht schon ein Host.
    return normalizeCustomDomain(raw)
  }
}

/** PURE: der Spaltenwert, fail-closed gelesen (siehe `customDomain.ts`). */
export function siteDomainStatusOf(row: SiteDomainRow): SiteDomainStatus {
  return resolveCustomDomainStatus(row.customDomainStatus)
}

/**
 * PURE: unter welcher Adresse ist diese Website zu Hause?
 *
 * Dieselbe Rechnung wie bei einer Community und bewusst über DIESELBE Funktion
 * (`canonicalHostFor`): aktive eigene Domain ⇒ die, sonst die Pukalani-Adresse.
 * `host` heißt bei einer Website nur anders.
 */
export function websiteCanonicalHost(row: SiteDomainRow): string {
  const fallback = websiteFallbackHost(row.appUrl)
  if (!fallback) return ''
  return canonicalHostFor({
    host: fallback,
    customDomain: row.customDomain,
    customDomainStatus: row.customDomainStatus,
  })
}

/**
 * PURE: ALLE Hosts, die zu dieser Website gehören — und der Grund, warum die
 * Middleware im Silo überhaupt eine Liste braucht.
 *
 * ── DER UNTERSCHIED ZUM POOL, DEN MAN NICHT ÜBERSEHEN DARF ────────────────
 * In der Platform-App löst JEDER Host über den Tenant-Resolver auf; ein Host,
 * den niemand kennt, endet in 404. Die Umleitung kann dort also getrost sagen
 * „du bist nicht kanonisch, geh dorthin" — der Request gehört per Definition
 * schon zu dieser Community.
 *
 * Eine SILO-App hat diese Tür nicht. Sie beantwortet heute JEDEN Host, unter
 * dem sie erreichbar ist: ihre Pukalani-Adresse, `localhost:3005` im
 * Entwicklungsbetrieb, die IP des Servers, eine Vorschau-Adresse. Eine
 * Umleitung „alles außer der kanonischen Adresse" würde deshalb den ersten
 * lokalen Seitenaufruf nach der Freischaltung auf `https://www.kunde.de`
 * werfen — die Entwicklung wäre kaputt und es sähe nach einem Fehler aus.
 *
 * Also andersherum: umgeleitet wird NUR von einem Host, den wir als unseren
 * kennen. Alles andere bleibt unberührt. Das ist zugleich die „Host-Annahme"
 * — die Liste ist die Antwort auf „welche Adressen sind meine?".
 */
export function websiteKnownHosts(row: SiteDomainRow): string[] {
  const hosts: string[] = []
  const fallback = websiteFallbackHost(row.appUrl)
  if (fallback) hosts.push(fallback)
  /**
   * NUR WENN DIE DOMAIN AKTIV IST — und das ist die zweite Falle dieser Datei.
   *
   * Naheliegend wäre, beide Formen aufzunehmen, sobald eine Domain
   * EINGETRAGEN ist: sie gehört uns ja schon (der TXT-Nachweis hält), sie ist
   * nur noch nicht kanonisch. Genau das wäre falsch, und zwar an der
   * empfindlichsten Stelle des ganzen Ablaufs.
   *
   * Zwischen „eingetragen" und „aktiv" liegt die AUSSTELLUNG DES ZERTIFIKATS,
   * und Let's Encrypt prüft über HTTP-01: es ruft
   * `http://kunde.de/.well-known/acme-challenge/<token>` auf. Der nginx-vHost
   * eines Silos reicht alles unterhalb von `/` an Nitro weiter (am 2026-08-07
   * an Site 390041 nachgelesen — es gibt keinen Zweig, der `.well-known` von
   * der Platte bedient; ploi legt ihn erst während der Anforderung als
   * `before/*`-Include an). Stünde die pending-Domain in dieser Liste, würde
   * unsere eigene Middleware die Challenge mit 301 auf die Pukalani-Adresse
   * schicken — die Ausstellung schlüge fehl, und zwar mit einer Fehlermeldung
   * von Let's Encrypt, die auf DNS zeigt statt auf uns.
   *
   * Solange eine Domain nicht aktiv ist, bedient die App sie also einfach
   * direkt. Das ist harmlos: ohne Zertifikat kommt ohnehin kein Browser
   * hindurch, und `http` braucht genau die Challenge, die dadurch durchkommt.
   * (Die Middleware lässt `/.well-known/` zusätzlich immer durch — zwei
   * Sicherungen für einen Fall, den man nur einmal falsch macht.)
   */
  const domain = normalizeCustomDomain(row.customDomain)
  if (domain && siteDomainStatusOf(row) === 'active') hosts.push(...customDomainForms(domain))
  return [...new Set(hosts)]
}

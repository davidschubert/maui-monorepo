/**
 * EIGENE DOMAIN JE COMMUNITY — die puren Regeln (Davids Entscheidungen vom
 * 2026-08-07, DECISION-LOG).
 *
 * Was hier steht, rechnet und entscheidet, ohne irgendetwas zu tun: keine
 * Appwrite-Zeile, kein DNS, kein ploi, kein Nuxt. Genau deshalb steht es hier
 * und nicht in den Routen — dieselbe Rechnung wird an VIER Stellen gebraucht,
 * und vier Kopien wären vier Gelegenheiten, sich zu unterscheiden:
 *
 *   1. das Dashboard (Eingabe prüfen, DNS-Anleitung anzeigen),
 *   2. die Runtime-Route im onboarding-Layer (Vorprüfung),
 *   3. die Control-Plane-Route (die AUTORITÄT — sie glaubt dem Aufrufer nichts),
 *   4. der Tenant-Resolver (welche Hosts gehören zu dieser Community?).
 *
 * ── DIE VIER ENTSCHEIDUNGEN, DIE HIER HÄNGEN ──────────────────────────────
 *
 *  (1) **Ab Plan Pro.** `CUSTOM_DOMAIN_MIN_PLAN` ist die eine Zahl dazu.
 *  (2) **301.** Die Subdomain (`communities.host`) leitet auf die eigene
 *      Domain um, sobald sie aktiv ist; sie bleibt der Rückfall. Umgesetzt in
 *      `00.tenant.ts` anhand von `canonicalHostFor()`.
 *  (3) **Selbstbedienung.** Der Owner trägt ein, das System prüft und schaltet.
 *  (4) **www + Apex automatisch**, eine Form leitet auf die andere um — und
 *      zwar auf die EINGETRAGENE (`customDomainForms()` / `canonicalHostFor()`).
 *
 * ── WARUM DIE EINTRAGUNG NICHT REICHT (Eigentums-Nachweis) ────────────────
 * Eine Domain, die auf unsere IP zeigt, beweist NICHTS über ihren Eigentümer:
 * eine verwaiste Domain kann einen alten A-Record auf uns behalten, und dann
 * könnte eine fremde Community sie beanspruchen und die Adresse übernehmen.
 * Deshalb zwei unabhängige Prüfungen (`customDomainDns.ts`):
 *   - ein TXT-Record `_pukalani-verify.<basis>` mit einem Token, das an GENAU
 *     DIESE Community gebunden ist ⇒ „ich darf über diese Zone bestimmen",
 *   - ein A-/CNAME-Record, der auf uns zeigt ⇒ „ich will hierher".
 * Beides muss halten. Das Token steht in der `communities`-Row und ist nur für
 * den Owner dieser Community sichtbar — eine zweite Community bekommt ein
 * anderes und kann den fremden Record nicht benutzen.
 */

import { OPERATOR_APEX } from '../schemas/tenant'
import { normalizeTenantPlan, type TenantPlan } from './types/tenantRecord'

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Die Stufen, die eine eigene Domain durchläuft. BEWUSST eine Kette und kein
 * Ja/Nein: der Owner soll sehen, WO es hängt, statt vor einem stummen
 * „funktioniert nicht" zu stehen.
 *
 *   none            — keine eigene Domain eingetragen (Normalfall)
 *   pending_dns     — eingetragen, aber TXT und/oder A/CNAME fehlen noch
 *   pending_cert    — DNS steht, das Zertifikat ist beantragt/unterwegs
 *   pending_platform— TLS steht, die Appwrite-Web-Platform fehlt noch (ohne
 *                     sie ist auf der Domain jede Realtime tot — F45)
 *   active          — die Domain ist die kanonische Adresse der Community
 *   error           — ein Schritt ist hart gescheitert, `customDomainError`
 *                     trägt den Text, den der Owner liest
 *
 * `pending_platform` ist eine EIGENE Stufe, obwohl der Schritt automatisiert
 * ist (gemessen am 2026-08-07 gegen die selbst gehostete 1.9.6: eine
 * gewöhnliche Projekt-API-Key genügt für `POST /v1/projects/:id/platforms`).
 * Der Grund ist der Fail-soft-Fall: scheitert der Aufruf, bleibt die Domain
 * sichtbar in dieser Stufe stehen, statt „aktiv" zu behaupten und den Kunden
 * mit einer Seite ohne Live-Aktualisierung sitzen zu lassen.
 */
export const CUSTOM_DOMAIN_STATUSES = [
  'none',
  'pending_dns',
  'pending_cert',
  'pending_platform',
  'active',
  'error',
] as const
export type CustomDomainStatus = (typeof CUSTOM_DOMAIN_STATUSES)[number]

/**
 * PURE: den Spaltenwert lesen — FAIL-CLOSED auf 'none'.
 *
 * Dieselbe Bauart und dieselbe Begründung wie `resolveTenantAudience()`: an
 * dieser Spalte hängt, welcher HOST eine Community bedient. `null` (Rows von
 * vor control-035 — Appwrite backfillt Spalten-Defaults nicht), '' und jeder
 * Tippfehler bedeuten „keine eigene Domain". Ein `!== 'none'`-Vergleich hätte
 * jede Bestands-Row in einen halbaktiven Zustand gehoben.
 */
export function resolveCustomDomainStatus(value: string | null | undefined): CustomDomainStatus {
  return (CUSTOM_DOMAIN_STATUSES as readonly string[]).includes(value ?? '')
    ? value as CustomDomainStatus
    : 'none'
}

/** Zählt diese Domain als LIVE, also als kanonische Adresse der Community? */
export function customDomainIsLive(
  domain: string | null | undefined,
  status: string | null | undefined,
): boolean {
  return Boolean(domain) && resolveCustomDomainStatus(status) === 'active'
}

// ── Plan-Grenze ─────────────────────────────────────────────────────────────

/**
 * Davids Entscheidung 1: eigene Domains gibt es ab **Pro**.
 *
 * ZWEI ORTE, EINE ZAHL — und das ist kein Versehen: `apps/platform` gatet über
 * `pukalani.tenancy.products.customDomain` (das ist die bestehende
 * Plan-Mechanik, die auch die UI-Sichtbarkeit trägt), das CONTROL PLANE kann
 * diese app.config aber nicht lesen (anderes Deployment, anderes Projekt) und
 * braucht seine eigene Wahrheit. Es ist die AUTORITÄT: die Runtime-Route darf
 * sich irren, die Control-Route nicht.
 *
 * Gegen das Auseinanderlaufen steht ein Test, der die app.config-Zeile von
 * `apps/platform` liest und mit dieser Konstante vergleicht
 * (`packages/control/tests/customDomain.test.ts`).
 */
export const CUSTOM_DOMAIN_MIN_PLAN: TenantPlan = 'pro'

/** PURE: darf dieser Plan eine eigene Domain? (Alt-Werte über normalizeTenantPlan) */
export function customDomainAllowedForPlan(plan: string | null | undefined): boolean {
  return normalizeTenantPlan(plan) === CUSTOM_DOMAIN_MIN_PLAN
}

// ── Eingabe normalisieren + prüfen ──────────────────────────────────────────

/**
 * PURE: was der Owner tippt → kanonischer Hostname.
 *
 * Menschen tippen `https://www.Beispiel.de/`, gemeint ist `www.beispiel.de`.
 * Schema, Pfad, Query, Port, Benutzerteil und der abschließende Punkt fallen
 * weg; Kleinschreibung wie überall sonst (`normalizeHost` in core macht mit
 * dem REQUEST-Host genau dasselbe — sonst träfen sich die beiden Seiten nie).
 */
export function normalizeCustomDomain(raw: string | null | undefined): string {
  let value = (raw ?? '').trim().toLowerCase()
  if (!value) return ''
  // Schema abschneiden (auch das schema-lose `//host`)
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\/\//, '')
  // Benutzerteil (user:pass@) — kommt aus kopierten URLs
  const at = value.lastIndexOf('@')
  if (at !== -1) value = value.slice(at + 1)
  // Pfad / Query / Fragment
  value = value.split('/')[0] ?? ''
  value = value.split('?')[0] ?? ''
  value = value.split('#')[0] ?? ''
  // Port
  value = value.split(':')[0] ?? ''
  // Wurzel-Punkt (`beispiel.de.` ist DNS-korrekt, als Host-Header aber nie da)
  while (value.endsWith('.')) value = value.slice(0, -1)
  return value
}

/** Warum eine Eingabe abgelehnt wurde — der Schlüssel reist als `reason`
 *  ins Fehler-Envelope und wird im Dashboard übersetzt. */
export const CUSTOM_DOMAIN_REJECTIONS = [
  /** Leer. */
  'empty',
  /** Zu lang (DNS: 253 Zeichen, ein Label 63). */
  'too_long',
  /** Zeichen/Form nicht DNS-konform (Umlaute ⇒ Punycode, keine Unterstriche …). */
  'invalid',
  /** Nur ein Label (`localhost`) oder eine IP — kein registrierbarer Name. */
  'not_a_domain',
  /** Unsere eigene Domain — sonst liefe die Sperrliste RESERVED_SUBDOMAINS leer. */
  'operator_domain',
] as const
export type CustomDomainRejection = (typeof CUSTOM_DOMAIN_REJECTIONS)[number]

export type CustomDomainCheck =
  | { ok: true, domain: string }
  | { ok: false, reason: CustomDomainRejection }

/** DNS-Label-Regeln: a–z, 0–9, Bindestrich (nie am Rand), 1–63 Zeichen. */
const labelRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
/** Vier Zahlenblöcke = IPv4. Eine IP ist keine Domain, die man beglaubigen kann. */
const ipv4Re = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * PURE (unit-getestet): darf diese Eingabe eine Kunden-Domain werden?
 *
 * DIE WICHTIGSTE ZEILE IST `operator_domain`. Ohne sie könnte ein Kunde
 * `login.pukalani.app` als „eigene Domain" eintragen und damit die
 * Sperrliste `RESERVED_SUBDOMAINS` umgehen, die genau diesen Phishing-Fall
 * verhindert — der Wizard prüft nur das SLUG, hier kommt ein VOLLER Host
 * herein. Geprüft wird die gesamte Betreiber-Domain und nicht nur die
 * reservierten Namen: eine Kunden-Community soll unter `pukalani.app`
 * überhaupt keine zweite Adresse anmelden können, die Subdomain hat sie schon.
 */
export function validateCustomDomain(raw: string | null | undefined): CustomDomainCheck {
  const domain = normalizeCustomDomain(raw)
  if (!domain) return { ok: false, reason: 'empty' }
  if (domain.length > 253) return { ok: false, reason: 'too_long' }
  if (ipv4Re.test(domain)) return { ok: false, reason: 'not_a_domain' }
  const labels = domain.split('.')
  if (labels.length < 2) return { ok: false, reason: 'not_a_domain' }
  if (!labels.every(label => label.length <= 63 && labelRe.test(label))) {
    return { ok: false, reason: 'invalid' }
  }
  // Die letzte Ebene ist die TLD — rein numerisch gibt es sie nicht (und eine
  // IPv4 mit fünf Blöcken wäre oben durchgerutscht).
  if (/^\d+$/.test(labels.at(-1) ?? '')) return { ok: false, reason: 'not_a_domain' }
  if (isOperatorDomain(domain)) return { ok: false, reason: 'operator_domain' }
  return { ok: true, domain }
}

/** Gehört dieser Host uns? (Betreiber-Apex + alles darunter.) */
export function isOperatorDomain(domain: string): boolean {
  return domain === OPERATOR_APEX || domain.endsWith(`.${OPERATOR_APEX}`)
}

// ── www ↔ Apex ──────────────────────────────────────────────────────────────

/**
 * PURE: die Geschwister-Form einer Domain — `null`, wenn es keine gibt.
 *
 *   beispiel.de           → www.beispiel.de
 *   www.beispiel.de       → beispiel.de
 *   blog.beispiel.de      → null
 *   www.blog.beispiel.de  → blog.beispiel.de
 *
 * DIE `null`-ZEILE IST DER PUNKT. Naheliegend wäre, IMMER ein `www.`
 * voranzustellen — dann bekäme `blog.beispiel.de` die Form
 * `www.blog.beispiel.de`, für die niemand einen DNS-Eintrag angelegt hat. Wir
 * würden dafür ein Let's-Encrypt-Zertifikat beantragen, die HTTP-01-Prüfung
 * würde scheitern, und der Kunde bekäme einen Fehler für einen Namen, den er
 * nie wollte. Ein Paar bilden wir deshalb nur da, wo es eindeutig ist: bei
 * einer zweistelligen Domain (Apex) und bei einer, die schon `www.` trägt.
 *
 * BEKANNTE GRENZE, bewusst nicht „behoben": `beispiel.co.uk` hat drei Labels
 * und ist trotzdem ein Apex — ohne Public-Suffix-Liste kann diese Funktion das
 * nicht wissen und liefert `null`. Der Weg dorthin ist trotzdem offen und
 * steht in der Anleitung: wer `www.beispiel.co.uk` einträgt, bekommt
 * `beispiel.co.uk` als Geschwister dazu. Eine geratene Liste wäre schlechter
 * als eine ehrliche Grenze.
 */
export function customDomainSibling(domain: string): string | null {
  if (!domain) return null
  if (domain.startsWith('www.')) {
    const rest = domain.slice(4)
    return rest.includes('.') ? rest : null
  }
  return domain.split('.').length === 2 ? `www.${domain}` : null
}

/** Beide Formen — die EINGETRAGENE zuerst (sie ist die kanonische). */
export function customDomainForms(domain: string): string[] {
  const sibling = customDomainSibling(domain)
  return sibling ? [domain, sibling] : [domain]
}

/**
 * PURE: die Basis des Paares — die Form OHNE `www.`. Dort liegt der
 * TXT-Record, damit EIN Eintrag für beide Formen genügt.
 */
export function customDomainBase(domain: string): string {
  return domain.startsWith('www.') && domain.slice(4).includes('.') ? domain.slice(4) : domain
}

/**
 * PURE: welche eingetragenen Domains könnten zu DIESEM Request-Host gehören?
 *
 * Der Resolver fragt die `communities`-Tabelle mit genau dieser Liste ab
 * (`Query.equal('customDomain', candidates)` — ein ODER über eine indizierte
 * Spalte, kein zweiter Index und keine zweite Abfrage). Trifft die Zeile über
 * die Geschwister-Form, ist der Request-Host NICHT kanonisch und bekommt die
 * Umleitung.
 */
export function customDomainCandidates(host: string): string[] {
  const domain = normalizeCustomDomain(host)
  if (!domain) return []
  const sibling = customDomainSibling(domain)
  return sibling ? [domain, sibling] : [domain]
}

// ── Kanonischer Host + Umleitung ────────────────────────────────────────────

export interface CanonicalHostInput {
  /** Die Pukalani-Subdomain der Community (`communities.host`) — immer da. */
  host: string
  /** Die eingetragene eigene Domain ('' = keine). */
  customDomain?: string | null
  /** Roher Spaltenwert des Status. */
  customDomainStatus?: string | null
}

/**
 * PURE: unter welcher Adresse ist diese Community zu Hause?
 *
 * Aktive eigene Domain ⇒ die; sonst die Subdomain. Das ist die eine Rechnung
 * hinter Davids Entscheidung 2 — und sie steht bewusst NICHT in der
 * Middleware: derselbe Wert entscheidet auch, wohin eine Benachrichtigungs-Mail
 * verlinkt (D5, `communityHostResolver`).
 */
export function canonicalHostFor(row: CanonicalHostInput): string {
  return customDomainIsLive(row.customDomain, row.customDomainStatus)
    ? (row.customDomain as string)
    : row.host
}

/*
 * DIE UMLEITUNG SELBST steht bewusst NICHT hier, sondern in
 * `packages/core/shared/canonicalHost.ts` (`canonicalRedirectTarget` /
 * `canonicalRedirectStatus`): sie wird von `00.tenant.ts` gebraucht, und ein
 * Fundament-Layer darf nicht an einem Naht-Layer hängen (CONCEPT.md A14).
 * Zwei Fragen, zwei Orte — „was ist zu Hause?" gehört zu den Daten (hier),
 * „bin ich dort?" zum Request (core).
 */

// ── Eigentums-Nachweis: der TXT-Record ──────────────────────────────────────

/** Das Label, unter dem der Nachweis liegt. Ein Unterstrich am Anfang ist die
 *  Konvention für Nicht-Host-Records (wie `_dmarc`) — er kollidiert nie mit
 *  einem echten Hostnamen des Kunden. */
export const CUSTOM_DOMAIN_VERIFY_LABEL = '_pukalani-verify'
/** Präfix im TXT-Wert: eine Zone trägt viele Nachweise verschiedener Anbieter. */
export const CUSTOM_DOMAIN_VERIFY_PREFIX = 'pukalani-domain-verify='

/** PURE: wo der Kunde den TXT-Record anlegt (an der BASIS, also ohne `www.`
 *  — ein Record deckt damit beide Formen ab). */
export function customDomainVerifyRecordName(domain: string): string {
  return `${CUSTOM_DOMAIN_VERIFY_LABEL}.${customDomainBase(domain)}`
}

/** PURE: was drinsteht. */
export function customDomainVerifyRecordValue(token: string): string {
  return `${CUSTOM_DOMAIN_VERIFY_PREFIX}${token}`
}

/**
 * PURE: steht unser Token in dieser TXT-Antwort?
 *
 * DNS liefert TXT als Liste von Strings je Record, und lange Werte werden in
 * 255-Zeichen-Häppchen zerlegt (`resolveTxt` gibt deshalb `string[][]`). Ein
 * Vergleich, der nur `chunks[0]` ansieht, wäre bei einer Zone mit mehreren
 * Nachweisen still falsch. Zusammengesetzt wird deshalb je Record, verglichen
 * über alle Records; Anführungszeichen und Leerraum werden geduldet, weil
 * manche DNS-Oberflächen sie mitspeichern.
 */
export function customDomainTokenPresent(records: string[][], token: string): boolean {
  if (!token) return false
  const wanted = customDomainVerifyRecordValue(token)
  return records.some((chunks) => {
    const value = chunks.join('').trim().replace(/^"|"$/g, '')
    return value === wanted
  })
}

/** Ein Token ist 32 Hex-Zeichen. (Erzeugt wird es server-seitig mit
 *  `randomBytes` — hier steht nur, was als eines durchgeht.) */
export function isCustomDomainToken(value: string | null | undefined): boolean {
  return /^[a-f0-9]{32}$/.test(value ?? '')
}

// ── Zeige-Prüfung: A / CNAME ────────────────────────────────────────────────

export interface DomainPointingInput {
  /** A-Records der Domain (leer = keine). */
  a: string[]
  /** CNAME-Ziel der Domain ('' = keines). */
  cname: string
  /** Unsere Server-IP(s). */
  serverIps: string[]
  /** Unser CNAME-Ziel (z. B. `platform.pukalani.app`). */
  cnameTarget: string
}

/**
 * PURE (unit-getestet): zeigt diese Domain auf uns?
 *
 * ZWEI Wege, weil DNS zwei erlaubt: ein Apex kann (bei den meisten Anbietern)
 * kein CNAME tragen und braucht einen A-Record, eine `www.`-Form nimmt am
 * besten ein CNAME. Beide Wege gelten — es genügt EINER.
 *
 * FAIL-CLOSED: ohne konfigurierte IP und ohne konfiguriertes CNAME-Ziel ist
 * die Antwort `false`, nicht `true`. Sonst wäre eine vergessene Konfiguration
 * ein „alles zeigt auf uns" und jede Domain sofort aktivierbar.
 */
export function domainPointsToUs(input: DomainPointingInput): boolean {
  const target = normalizeCustomDomain(input.cnameTarget)
  const cname = normalizeCustomDomain(input.cname)
  if (target && cname && cname === target) return true
  const ips = input.serverIps.map(ip => ip.trim()).filter(Boolean)
  if (!ips.length) return false
  return input.a.some(record => ips.includes(record.trim()))
}

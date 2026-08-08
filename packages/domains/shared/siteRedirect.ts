/**
 * DIE ENTSCHEIDUNG DER SILO-UMLEITUNG — pur, damit sie prüfbar ist
 * (control-036).
 *
 * Sie stand zuerst mitten in der Middleware. Dort war sie richtig und
 * trotzdem falsch aufgehoben: es sind vier Bedingungen, von denen jede
 * einzelne schon einmal Betrieb gekostet hat (Pfad-Ausnahmen, unbekannte
 * Hosts, fail-soft, HTTP-01), und keine davon ließe sich anfassen, ohne einen
 * Dev-Server zu starten.
 *
 * Hier rechnet niemand etwas Neues: `canonicalRedirectTarget` und
 * `canonicalRedirectStatus` sind DIESELBEN Funktionen, die im Pool die
 * Community-Umleitung tragen (core). Was hier dazukommt, ist die Vorfrage
 * „darf ich diesen Request überhaupt anfassen?".
 */
import { canonicalRedirectStatus, canonicalRedirectTarget } from '../../core/shared/canonicalHost'
import { isErrorPageRenderPass } from '../../core/shared/unknownHost'

/**
 * Pfade, die NIE umgeleitet werden — jeder mit einem Vorfall dahinter:
 *
 *  · `/.well-known/` — dort holt Let's Encrypt seine HTTP-01-Antwort ab, und
 *    der nginx-vHost eines Silos reicht alles an Nitro weiter (2026-08-07 an
 *    ploi-Site 390041 nachgelesen). Eine Umleitung ließe die Ausstellung
 *    scheitern, mit einer Meldung, die auf DNS zeigt statt auf uns.
 *  · `/api/health` — Deploy-Prüfung und Überwachung fragen den SITE-Host. Eine
 *    Umleitung schickte beide auf eine fremde Adresse; der Health-Sweep der
 *    Betreiber-Konsole meldete „degraded", obwohl alles läuft.
 *  · `/_i18n/` — nuxt-i18n lädt seine Locale-Messages im Prod-Build per
 *    INTERNEM self-fetch ohne Host-Header. Ein Umlenken dort ließe jede Seite
 *    mit rohen Schlüsseln rendern (Prod-Befund 2026-07-23).
 *  · `/__nuxt_error` — Nuxts INTERNER Render-Durchgang für die Fehlerseite.
 *    Das ist derselbe Fall, den `00.tenant.ts` als C12b festhält, nur
 *    andersherum: dort wurde er geworfen, hier umgeleitet.
 *
 *    2026-08-07 im eigenen Beweis erwischt, und der Weg dorthin ist
 *    lehrreich: die ACME-Ausnahme GRIFF, der Request lief durch, Nitro fand
 *    nichts und antwortete 404 — woraufhin Nuxt seine Fehlerseite über einen
 *    internen Request auf `/__nuxt_error` rendert. DER lief noch einmal durch
 *    diese Middleware, mit demselben Host und einem Pfad, der keine Ausnahme
 *    ist, und bekam die Umleitung. Ergebnis: eine 301 auf eine
 *    `__nuxt_error`-URL mit dem halben Stacktrace in der Query, ausgerechnet
 *    für die Let's-Encrypt-Prüfung. Die Ausnahme war also richtig und
 *    trotzdem wirkungslos, solange ihr Nachspiel nicht mitgedacht war.
 */
export function siteRedirectExemptPath(path: string): boolean {
  const clean = path.split('?')[0] ?? ''
  return clean === '/api/health'
    || clean.startsWith('/_i18n/')
    || clean.startsWith('/.well-known/')
    || isErrorPageRenderPass(clean)
}

export interface SiteRedirectInput {
  /** Der normalisierte Request-Host (klein, ohne Port). */
  host: string
  /** Voller Pfad inkl. Query. */
  path: string
  method: string | undefined
  /** Die Auskunft der Naht — `null` heißt „keine Antwort" (fail-soft). */
  address: { canonicalHost: string, knownHosts: string[] } | null
}

export interface SiteRedirectDecision {
  target: string
  status: 301 | 308
}

/**
 * PURE: umleiten — ja/nein/wohin?
 *
 * `null` = diesen Request in Ruhe lassen. Das ist der Normalfall und die
 * sichere Antwort; die vier Gründe dafür stehen jeweils an ihrer Zeile.
 */
export function decideSiteRedirect(input: SiteRedirectInput): SiteRedirectDecision | null {
  if (siteRedirectExemptPath(input.path)) return null

  // FAIL-SOFT: keine Auskunft ⇒ KEINE Umleitung. Nicht „die alte Adresse",
  // nicht „irgendeine" — gar keine. Ein Ausfall des Control Plane darf eine
  // laufende Silo-Site nicht mitreißen, und eine Umleitung mit `301` ist das
  // Letzte, was man auf gut Glück verschicken will.
  if (!input.address?.canonicalHost) return null

  // NUR VON BEKANNTEN HOSTS. Der Pool kann sich das sparen — dort endet ein
  // unbekannter Host in 404, der Request gehört also per Definition schon zur
  // Community. Eine Silo-App beantwortet dagegen JEDEN Host: ihre
  // Pukalani-Adresse, `localhost` in der Entwicklung, die Server-IP, eine
  // Vorschau-Adresse. „Alles außer der kanonischen Adresse umleiten" würde die
  // lokale Entwicklung beim ersten Seitenaufruf nach der Freischaltung auf
  // `https://www.kunde.de` werfen.
  if (!input.host || !input.address.knownHosts.includes(input.host)) return null

  const target = canonicalRedirectTarget(input.host, input.address.canonicalHost, input.path)
  if (!target) return null

  return { target, status: canonicalRedirectStatus(input.method) }
}

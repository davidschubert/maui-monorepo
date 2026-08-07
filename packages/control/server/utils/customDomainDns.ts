/**
 * DNS-PRÜFUNG FÜR EIGENE DOMAINS — die einzige Stelle, die wirklich fragt.
 *
 * ZWEI FRAGEN, ZWEI ANTWORTEN, und beide müssen ja sein, bevor eine Domain
 * aktiv wird (Davids Entscheidung 3 vom 2026-08-07: Selbstbedienung — dann
 * muss der Server sich selbst überzeugen, es steht niemand daneben):
 *
 *   1. **DARF diese Community?** — TXT `_pukalani-verify.<basis>` trägt das
 *      Token AUS IHRER ZEILE. Ohne diese Frage könnte eine fremde Community
 *      eine verwaiste Domain beanspruchen, die zufällig noch auf unsere IP
 *      zeigt, und damit deren Adresse übernehmen. Die Zeige-Prüfung allein
 *      beweist keinen Eigentümer.
 *   2. **WILL diese Domain?** — A-Record auf unsere IP oder CNAME auf unser
 *      Ziel. Ohne diese Frage beantragten wir Zertifikate für Namen, die nie
 *      bei uns ankommen (Let's Encrypt hat Ratengrenzen, und ein Kunde säße
 *      vor einem Fehler, den er nicht versteht).
 *
 * ── WARUM `Resolver` UND NICHT `dns.promises` DIREKT ──────────────────────
 * `dns.promises.resolveTxt` benutzt die Resolver des BETRIEBSSYSTEMS. Auf
 * einem Server ist das oft ein lokaler Cache (systemd-resolved, dnsmasq), der
 * eine gerade angelegte Zone minutenlang als „gibt es nicht" festhält —
 * negative Antworten werden gecacht, und zwar mit der TTL der SOA. Der Kunde
 * legt seinen Record an, klickt „Prüfen", bekommt „nicht gefunden", und
 * niemand kann sagen warum. Ein EIGENER Resolver mit öffentlichen Servern
 * umgeht den Cache und fragt die Kette selbst.
 *
 * ── TIMEOUT ────────────────────────────────────────────────────────────────
 * Der Prüf-Klick hängt an einem Request. Eine tote Zone lässt c-ares sonst
 * mehrere Sekunden je Abfrage warten; drei Abfragen hintereinander wären eine
 * halbe Minute. `Resolver` bekommt deshalb ein Zeitbudget und wir rennen
 * zusätzlich gegen eine eigene Uhr (das `timeout`-Feld greift je VERSUCH, die
 * Gesamtzeit ist Versuche × Timeout).
 */
import { Resolver } from 'node:dns/promises'
import {
  customDomainBase,
  customDomainTokenPresent,
  customDomainVerifyRecordName,
  domainPointsToUs,
} from '../../shared/customDomain'

/**
 * Öffentliche Resolver — Cloudflare und Google, in dieser Reihenfolge.
 * ZWEI, weil einer ausfallen kann und ein Ausfall sonst als „dein DNS ist
 * falsch" beim Kunden landet. Überschreibbar per Env, falls ein Netz beide
 * blockt (NUXT_CUSTOM_DOMAIN_DNS_SERVERS).
 */
const DEFAULT_DNS_SERVERS = ['1.1.1.1', '8.8.8.8']

/** Zeitbudget je DNS-Versuch. */
const DNS_TIMEOUT_MS = 4000

export interface DomainDnsCheck {
  /** Der TXT-Nachweis steht und trägt das Token DIESER Community. */
  owned: boolean
  /** Mindestens eine der beiden Formen zeigt auf uns. */
  pointing: boolean
  /** Zeigt die KANONISCHE Form auf uns? (Nur sie muss — die Geschwister-Form
   *  ist Zugabe und darf fehlen, ohne die Freischaltung zu blockieren.) */
  canonicalPointing: boolean
  /** Welche der beiden Formen zeigen auf uns (für die Anzeige im Dashboard). */
  pointingForms: string[]
  /** Wo der TXT-Record gesucht wurde (Anzeige + Fehlersuche). */
  txtRecordName: string
  /** Roher Fehlertext einer DNS-Abfrage, '' = keiner. Nie an den Kunden
   *  durchgereicht ohne Einordnung — er sagt „NXDOMAIN", nicht „was tun". */
  error: string
}

export interface DomainDnsOptions {
  serverIps: string[]
  cnameTarget: string
  dnsServers?: string[]
}

function createResolver(servers?: string[]): Resolver {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 })
  const list = (servers ?? DEFAULT_DNS_SERVERS).filter(Boolean)
  if (list.length) resolver.setServers(list)
  return resolver
}

/** Eine Abfrage, die NICHT wirft: „gibt es nicht" ist hier eine Antwort und
 *  kein Fehler — der Normalfall beim ersten Klick ist ja gerade, dass der
 *  Record noch fehlt. */
async function safe<T>(run: () => Promise<T>, fallback: T): Promise<{ value: T, error: string }> {
  try {
    return { value: await run(), error: '' }
  }
  catch (error) {
    const code = (error as { code?: string }).code ?? ''
    // ENODATA/NXDOMAIN/ENOTFOUND = „diesen Record gibt es nicht" — normal.
    // Alles andere (SERVFAIL, TIMEOUT, REFUSED) ist ein echter Fehler und
    // gehört gemeldet, sonst sieht eine kaputte Zone aus wie ein fehlender
    // Eintrag und der Kunde legt ihn zum dritten Mal an.
    const benign = code === 'ENODATA' || code === 'ENOTFOUND' || code === 'ENOTIMP'
    return { value: fallback, error: benign ? '' : (code || String(error)) }
  }
}

/**
 * Beide Fragen stellen. Wirft NIE — ein DNS-Ausfall darf einen Prüf-Klick
 * nicht in einen 500 verwandeln, er soll in einer ehrlichen Statuszeile enden.
 */
export async function checkDomainDns(
  forms: string[],
  token: string,
  options: DomainDnsOptions,
): Promise<DomainDnsCheck> {
  const canonical = forms[0] ?? ''
  const txtRecordName = customDomainVerifyRecordName(canonical || customDomainBase(canonical))
  const resolver = createResolver(options.dnsServers)
  const errors: string[] = []

  // ── 1. Eigentum ──────────────────────────────────────────────────────────
  const txt = await safe(() => resolver.resolveTxt(txtRecordName), [] as string[][])
  if (txt.error) errors.push(`TXT ${txtRecordName}: ${txt.error}`)
  const owned = customDomainTokenPresent(txt.value, token)

  // ── 2. Zeigen ────────────────────────────────────────────────────────────
  const pointingForms: string[] = []
  for (const form of forms) {
    const [a, cname] = await Promise.all([
      safe(() => resolver.resolve4(form), [] as string[]),
      safe(() => resolver.resolveCname(form), [] as string[]),
    ])
    if (a.error) errors.push(`A ${form}: ${a.error}`)
    if (cname.error) errors.push(`CNAME ${form}: ${cname.error}`)
    const points = domainPointsToUs({
      a: a.value,
      cname: cname.value[0] ?? '',
      serverIps: options.serverIps,
      cnameTarget: options.cnameTarget,
    })
    if (points) pointingForms.push(form)
  }

  return {
    owned,
    pointing: pointingForms.length > 0,
    canonicalPointing: pointingForms.includes(canonical),
    pointingForms,
    txtRecordName,
    error: errors.join(' · '),
  }
}

/**
 * Antwortet die Domain schon über HTTPS? — der EHRLICHE Beleg dafür, dass das
 * Zertifikat wirklich liegt.
 *
 * Naheliegend wäre, ploi zu glauben („Anfrage angenommen") und die Domain
 * sofort aktiv zu schalten. Die Anfrage ist aber ASYNCHRON: ploi stellt einen
 * Job ein, Let's Encrypt prüft, nginx wird neu geladen — Sekunden bis Minuten
 * später. Wer dazwischen „aktiv" schreibt, leitet die Subdomain per 301 auf
 * eine Adresse um, die noch ein Zertifikats-Warnschild zeigt. Also fragen wir
 * die Domain selbst.
 *
 * `/api/health` ist der host-freie Infra-Pfad (00.tenant.ts lässt ihn vor der
 * Mandanten-Auflösung durch) — er antwortet also auch dann, wenn die
 * Zuordnung Host→Community noch gar nicht steht. Gemessen wird NUR, ob der
 * TLS-Handschlag hält; der Inhalt ist gleichgültig.
 */
export async function domainAnswersOverHttps(domain: string, timeoutMs = 8000): Promise<{ ok: boolean, error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetch(`https://${domain}/api/health`, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    })
    // Jede HTTP-Antwort genügt: sie beweist, dass TLS gehalten hat. Ein 404
    // oder ein 301 ist hier genauso gut wie ein 200 — die Frage war das
    // Zertifikat, nicht die Route.
    return { ok: true, error: '' }
  }
  catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  finally {
    clearTimeout(timer)
  }
}

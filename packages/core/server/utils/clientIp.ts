import type { H3Event } from 'h3'

/**
 * WELCHE IP GEHÖRT DEM CLIENT? — EINE Antwort für das ganze System.
 *
 * ── Der Befund (Sicherheits-Audit 2026-08-02, HOCH — nachgemessen) ────────
 * Alle IP-Nutzer riefen bisher `getRequestIP(event, { xForwardedFor: true })`.
 * h3 1.15.11 nimmt darin das **ERSTE** Segment von `X-Forwarded-For`
 * (`dist/index.mjs`: `.split(",").shift()`), und die nginx-Vorlage dieses
 * Projekts setzt `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
 * (docs/archiv/HELP-GO-LIVE.md) — `$proxy_add_x_forwarded_for` HÄNGT die echte
 * Client-IP hinten AN, es überschreibt nicht.
 *
 * Beides zusammen heißt: wer `X-Forwarded-For: 1.2.3.4` mitschickt, erzeugt
 * `1.2.3.4, <echte IP>` — und gelesen wurde `1.2.3.4`. Damit war JEDES
 * IP-Limit mit einem Header-Zähler aushebelbar (Login-Brute-Force an erster
 * Stelle) und die IP im Aktivitätsprotokoll frei erfunden. Die im Code und in
 * der Phase-17-Checkliste notierte Annahme („nur hinter einem Proxy, der den
 * Header ÜBERSCHREIBT") beschrieb ein Setup, das es hier nie gab: die Firewall
 * verhindert das UMGEHEN des Proxys, nicht das MITSCHICKEN eines Headers
 * DURCH ihn.
 *
 * ── Die Regel ────────────────────────────────────────────────────────────
 * Vertrauenswürdig ist das **LETZTE** Segment: das ist das, was der eigene
 * Proxy angehängt hat. Alles davor stammt aus dem Request und ist damit
 * Behauptung. Ohne Header bleibt `remoteAddress` — im Betrieb also die IP des
 * lokalen nginx (dann ist ohnehin jeder im selben Topf, was auffällt), lokal
 * die echte.
 *
 * EHRLICHE GRENZE: das setzt GENAU EINEN eigenen Proxy voraus. Für den einen
 * Host, der zusätzlich über Cloudflare läuft (`pukalani.app`, s. CLAUDE.md),
 * ist das letzte Segment die Cloudflare-Kante — dort landen also alle Besucher
 * in einem Bucket. Das ist die sichere Richtung (zu streng, nie zu lasch), und
 * dieser Host trägt keine Auth-Routen. Käme je eine zweite Proxy-Ebene vor die
 * Auth-Hosts, gehört hier ein konfigurierbarer Hop-Zähler hin — nicht ein
 * Zurück auf „erstes Segment".
 */

/**
 * PURE (unit-getestet): Header-Wert + Socket-Adresse → vertrauenswürdige IP.
 * `''` wenn nichts Brauchbares dasteht.
 */
export function resolveClientIp(
  forwardedFor: string | undefined | null,
  remoteAddress?: string | undefined | null,
): string {
  const segments = (forwardedFor ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  // Das letzte Segment hat unser eigener Proxy angehängt.
  const proxied = segments.at(-1)
  return proxied || (remoteAddress ?? '').trim() || ''
}

/**
 * Die IP dieses Requests. Ersetzt `getRequestIP(event, { xForwardedFor: true })`
 * überall dort, wo die IP eine SICHERHEITS-Entscheidung trägt (Rate-Limit,
 * Aktivitätsprotokoll, Gast-Pseudonymisierung). `undefined`, wenn es keine gibt
 * — der Aufrufer entscheidet, was das bedeutet (die Rate-Limit-Middleware
 * weicht z. B. auf die Session-Identität aus, statt alle in einen Topf zu
 * werfen).
 */
export function trustedClientIp(event: H3Event): string | undefined {
  // Nitro-Preset-Adapter (z. B. Cloudflare/Vercel) setzen die IP selbst — die
  // kommt dann nicht aus einem Header und ist die beste Quelle, die es gibt.
  const fromContext = (event.context as { clientAddress?: string }).clientAddress
  if (fromContext) return fromContext
  return resolveClientIp(getRequestHeader(event, 'x-forwarded-for'), event.node.req.socket.remoteAddress) || undefined
}

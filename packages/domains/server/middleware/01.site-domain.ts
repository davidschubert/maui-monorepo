/**
 * DIE UMLEITUNG AUF DIE KANONISCHE ADRESSE — Silo-Fassung (control-036).
 *
 * Das Gegenstück zu den Zeilen in `core/server/middleware/00.tenant.ts`, die
 * dasselbe für Pool-Communities tun. Gerechnet wird mit DENSELBEN puren
 * Funktionen (`canonicalRedirectTarget` / `canonicalRedirectStatus` in
 * core) — es gibt keine zweite Fassung der Regel „bin ich zu Hause?".
 *
 * Was anders ist, ist alles drumherum, und das sind vier Dinge:
 *
 * (1) SIE LIEGT IN DIESEM LAYER, nicht in core. Sie existiert damit nur in
 *     Apps, die `domains` ziehen. In core hätte sie ein Config-Gate gebraucht
 *     und wäre in JEDER App mitgelaufen, um dort nichts zu tun.
 *
 * (2) SIE FRAGT ÜBER DIE NAHT statt einen Resolver. Eine Silo-App hat keinen
 *     Tenant-Resolver; ihre Adresse steht im Control Plane. Gecacht 30 s,
 *     einfach-fliegend, FAIL-SOFT — keine Antwort heißt KEINE Umleitung
 *     (Begründung in `utils/siteDomain.ts`). Ein Ausfall des Control Plane
 *     darf eine laufende Site nicht mitreißen.
 *
 * (3) SIE LEITET NUR VON BEKANNTEN HOSTS UM. Der Pool kann sich das sparen —
 *     dort endet ein unbekannter Host ohnehin in 404, der Request gehört also
 *     per Definition schon zur Community. Eine Silo-App beantwortet dagegen
 *     JEDEN Host: ihre Pukalani-Adresse, `localhost:3001` in der Entwicklung,
 *     die Server-IP, eine Vorschau-Adresse. „Alles außer der kanonischen
 *     Adresse umleiten" würde die lokale Entwicklung beim ersten Seitenaufruf
 *     nach der Freischaltung auf `https://www.kunde.de` werfen.
 *
 * (4) SIE LÄSST `/.well-known/` IMMER DURCH. Dort holt Let's Encrypt seine
 *     HTTP-01-Antwort ab, und der nginx-vHost eines Silos reicht alles an
 *     Nitro weiter (am 2026-08-07 an Site 390041 nachgelesen). Eine Umleitung
 *     hier ließe die Ausstellung scheitern — mit einer Meldung, die auf DNS
 *     zeigt statt auf uns. Zweite Sicherung neben `websiteKnownHosts`, das
 *     wartende Domains gar nicht erst aufnimmt; diesen Fall macht man nur
 *     einmal falsch.
 *
 * ── ZWEI PFADE, DIE AUS DEMSELBEN GRUND WIE IM POOL AUSSEN VOR BLEIBEN ────
 * `/api/health` (Deploy-Prüfung und Überwachung fragen den kanonischen
 * SITE-Host; eine Umleitung würde beides auf eine fremde Adresse schicken und
 * der Betreiber-Health-Sweep meldete „degraded") und `/_i18n/` (nuxt-i18n
 * lädt seine Locale-Messages im Prod-Build per INTERNEM self-fetch ohne
 * Host-Header — ein Umlenken dort ließe jede Seite mit rohen Schlüsseln
 * rendern, Prod-Befund 2026-07-23).
 */
import { decideSiteRedirect, siteRedirectExemptPath } from '../../shared/siteRedirect'
import { siteDomainAddress } from '../utils/siteDomain'

export default defineEventHandler(async (event) => {
  // Die Ausnahme-Pfade VOR dem Naht-Aufruf, nicht erst in der Entscheidung:
  // sonst kostete jeder Health-Check und jeder ACME-Abruf einen Blick in den
  // Zwischenspeicher (und beim ersten einen Netzaufruf), nur um am Ende nichts
  // zu tun.
  if (siteRedirectExemptPath(event.path)) return

  const address = await siteDomainAddress(event)
  const decision = decideSiteRedirect({
    host: normalizeHost(getHeader(event, 'host')),
    path: event.path,
    method: event.method,
    address,
  })
  if (!decision) return

  // `no-store` daneben, aus demselben Grund wie im Pool: ein 301 darf ein
  // Browser für immer behalten. Genau das würde die Zusage brechen, dass die
  // Pukalani-Adresse Rückfall bleibt — nähme der Kunde seine Domain wieder
  // weg, stünde jeder Besucher mit gemerkter Umleitung vor einer toten
  // Adresse. Der Header nimmt das Risiko nicht ganz weg (manche Browser
  // merken sich einen 301 trotzdem), aber er ist das, was von hier aus geht.
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return await sendRedirect(event, decision.target, decision.status)
})

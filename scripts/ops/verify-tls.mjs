#!/usr/bin/env node
/**
 * TLS-Wächter: prüft für JEDEN öffentlichen Host, ob das ausgelieferte
 * Zertifikat wirklich zu ihm passt und nicht bald abläuft.
 *
 *   node scripts/ops/verify-tls.mjs            # alle Hosts
 *   node scripts/ops/verify-tls.mjs demo.pukalani.app
 *
 * WARUM ES DAS GIBT (Vorfall 2026-07-27): ploi leitet den certbot-Lineage-
 * Namen aus der BASIS-Domain ab. Alle Sites einer Zone teilen sich damit
 * EINE Datei (/etc/letsencrypt/live/pukalani.app/). Eine Zertifikats-
 * Anforderung für IRGENDEINE Site überschreibt still das Zertifikat, das
 * alle anderen ausliefern — an dem Tag waren platform + demo ~40 min
 * TLS-tot, weil ein Zertifikat für die Landingpage die Wildcard ersetzt hat.
 * Der Fehler ist unsichtbar: nginx läuft weiter, die App antwortet, nur der
 * Handshake bricht. Genau diese Lücke schließt dieses Skript.
 *
 * Es prüft, was der Server WIRKLICH ausliefert (SNI-Handshake gegen die
 * IP) — nicht, was in einer Konfigurationsdatei behauptet wird.
 *
 * Exit 0 = alles gut · Exit 1 = mindestens ein Host kaputt (CI wird rot).
 */
import tls from 'node:tls'

/** Öffentliche Hosts der Zone. Neue Kunden-Subdomains sind von der Wildcard
 *  gedeckt und müssen hier NICHT eingetragen werden — nur eigenständige
 *  Namen (Apex) und Hosts mit eigenem Zertifikat.
 *
 *  `ip` = gegen den URSPRUNG prüfen (SNI-Handshake auf die feste IP, an der
 *  DNS vorbei). Ohne `ip` wird der Name normal aufgelöst — das ist der Weg
 *  für Hosts, die proxied über Cloudflare laufen und am Ursprung bewusst
 *  KEIN eigenes Zertifikat haben (Apex, seit 2026-07-27). */
const HOSTS = [
  { host: 'pukalani.app', note: 'Landing (Apex — proxied über Cloudflare; am Ursprung seit D4 ein Cloudflare-Origin-Zertifikat, NICHT browservertraut und deshalb hier nur über die Kante geprüft)' },
  { host: 'www.pukalani.app', ip: '49.13.211.173', note: 'Landing am Ursprung (von der Wildcard gedeckt)' },
  { host: 'control.pukalani.app', ip: '49.13.211.173', note: 'Control Plane' },
  { host: 'comments.pukalani.app', ip: '49.13.211.173', note: 'Silo-Kunde' },
  { host: 'portfolio.pukalani.app', ip: '49.13.211.173', note: 'Silo-Kunde' },
  { host: 'platform.pukalani.app', ip: '49.13.211.173', note: 'Pool-App' },
  { host: 'demo.pukalani.app', ip: '49.13.211.173', note: 'Pool-Tenant (Stellvertreter für ALLE Kunden)' },
  { host: 'my.pukalani.app', ip: '49.13.211.173', note: 'Kundenbereich' },
  { host: 'start.pukalani.app', ip: '49.13.211.173', note: 'Wizard-Kurzlink' },
  // Von der Wildcard gedeckt — es gibt und braucht KEINE eigene Zertifikats-
  // Anforderung fuer diesen Host (Lineage-Falle, s. Kopf der Datei). Der
  // Handshake ist schon gruen, BEVOR die ploi-Site existiert: nginx liefert
  // dem unbekannten Host den Default-Vhost mit demselben Wildcard aus
  // (verifiziert am 2026-07-27 per openssl gegen die IP → CN=*.pukalani.app,
  // HTTP dabei 404). Der Eintrag prueft also ab sofort die Wildcard-Gesundheit
  // und ab dem Go-Live zusaetzlich die Site.
  { host: 'help.pukalani.app', ip: '49.13.211.173', note: 'Hilfe-Site (von der Wildcard gedeckt)' },
  { host: 'api.pukalani.app', ip: '188.245.61.155', note: 'Appwrite' },
]

/** Warnschwelle in Tagen — Let's Encrypt erneuert bei 30. */
const MIN_DAYS = 14

/** Deckt ein SAN-Eintrag den Host ab? Wildcards gelten nur für EINE Ebene
 *  und NIE für die Basis-Domain selbst (*.example.com ≠ example.com). */
function sanCovers(san, host) {
  if (san === host) return true
  if (!san.startsWith('*.')) return false
  const suffix = san.slice(1) // ".example.com"
  if (!host.endsWith(suffix)) return false
  const label = host.slice(0, host.length - suffix.length)
  return label.length > 0 && !label.includes('.')
}

function peerCert(host, ip) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: ip ?? host, port: 443, servername: host, timeout: 10_000,
      // Wir wollen das Zertifikat auch dann SEHEN, wenn es nicht passt —
      // die Bewertung machen wir selbst und mit klarer Fehlermeldung.
      rejectUnauthorized: false,
    }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()
      resolve({ cert })
    })
    socket.on('timeout', () => { socket.destroy(); resolve({ error: 'Zeitüberschreitung' }) })
    socket.on('error', error => resolve({ error: error.message }))
  })
}

const failures = []
console.log(`TLS-Wächter — ${HOSTS.length} Hosts\n`)

for (const { host, ip, note } of HOSTS) {
  const { cert, error } = await peerCert(host, ip)
  if (error || !cert || !cert.subject) {
    failures.push(`${host}: kein Zertifikat (${error ?? 'leere Antwort'})`)
    console.log(`✗ ${host.padEnd(24)} ${error ?? 'kein Zertifikat'}`)
    continue
  }

  const sans = String(cert.subjectaltname ?? '')
    .split(',').map(s => s.trim().replace(/^DNS:/, '')).filter(Boolean)
  const days = Math.floor((Date.parse(cert.valid_to) - Date.now()) / 86_400_000)
  const covered = sans.some(san => sanCovers(san, host))

  if (!covered) {
    failures.push(`${host}: ausgeliefertes Zertifikat deckt den Host NICHT ab (SAN: ${sans.join(', ') || '—'})`)
    console.log(`✗ ${host.padEnd(24)} SAN passt nicht → ${sans.join(', ') || '—'}`)
    continue
  }
  if (days < MIN_DAYS) {
    failures.push(`${host}: läuft in ${days} Tagen ab`)
    console.log(`✗ ${host.padEnd(24)} läuft in ${days} Tagen ab`)
    continue
  }
  console.log(`✔ ${host.padEnd(24)} ${sans.join(', ')}  (${days} Tage)  — ${note}`)
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} Host(s) kaputt:`)
  for (const f of failures) console.error(`  · ${f}`)
  console.error('\nWahrscheinlichste Ursache bei einem *.pukalani.app-Host: eine Zertifikats-')
  console.error('Anforderung in ploi hat die geteilte Lineage /etc/letsencrypt/live/pukalani.app/')
  console.error('überschrieben. Reparatur: auf der ploi-Site platform.pukalani.app den Eintrag')
  console.error('löschen und "*.pukalani.app" per DNS-Prüfung neu anfordern.')
  console.error('Beim Apex dagegen liegt es NICHT am Ursprung — er läuft proxied über')
  console.error('Cloudflare (Zonen-Modus "Full", gepinnt) und hat dort bewusst kein Zertifikat.')
  console.error('Details: docs/content/2.architektur/6.hosts-und-ports.md')
  process.exit(1)
}
console.log('\n✔ Alle Hosts liefern ein passendes, gültiges Zertifikat.')

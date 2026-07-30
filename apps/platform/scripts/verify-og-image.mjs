#!/usr/bin/env node
/**
 * Beweis für das Vorschaubild je Community (og:image, OPEN-ITEMS B2).
 *
 * Prüft an einem LAUFENDEN Dev-Server (oder gegen einen echten Host), dass
 *  1. die SSR-Antwort eines Mandanten-Hosts og:image mit ABSOLUTER URL auf
 *     DIESEN Host trägt, dazu Typ, Maße und twitter:card,
 *  2. diese URL ein echtes PNG in 1200×630 liefert (Maße aus dem IHDR gelesen,
 *     nicht geglaubt) mit content-type image/png und langem Cache-Header,
 *  3. ein erfundener Schlüssel 404 bekommt (keine Datei-Flut auf der Platte).
 *
 * Aufruf:
 *   node scripts/verify-og-image.mjs                  # demo.localhost:3006
 *   node scripts/verify-og-image.mjs --host demo.pukalani.app --port 443 --tls
 *   node scripts/verify-og-image.mjs --save /tmp/karte.png
 *
 * Warum node:http und nicht fetch (dieselbe Falle wie in den
 * onboarding-Skripten): Node's `fetch` VERWIRFT einen selbst gesetzten
 * Host-Header — ohne den löst die Tenant-Middleware aber gar keinen Mandanten
 * auf. Und Nitro hört im Dev auf `[::1]`, nicht auf 127.0.0.1.
 */
import http from 'node:http'
import https from 'node:https'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const host = flag('host', 'demo.localhost')
const port = Number(flag('port', '3006'))
const tls = args.includes('--tls')
const address = flag('address', tls ? host : '::1')
const save = flag('save', '')

function request(path) {
  return new Promise((resolve, reject) => {
    const req = (tls ? https : http).request({
      host: address,
      port,
      path,
      method: 'GET',
      headers: { host, 'user-agent': 'verify-og-image' },
      servername: tls ? host : undefined,
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** Alle <meta …> mit property/name → Wert. */
function metaTags(html) {
  const out = {}
  for (const tag of html.match(/<meta[^>]*>/g) ?? []) {
    const key = /(?:property|name)="([^"]+)"/.exec(tag)?.[1]
    const value = /content="([^"]*)"/.exec(tag)?.[1]
    if (key) out[key] = value ?? ''
  }
  return out
}

let failed = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const page = await request('/')
check(page.status === 200, `SSR ${host} antwortet 200`, `status ${page.status}`)
const meta = metaTags(page.body.toString('utf8'))

const imageUrl = meta['og:image'] ?? ''
check(Boolean(imageUrl), 'og:image ist gesetzt', imageUrl)
check(/^https?:\/\//.test(imageUrl), 'og:image ist absolut (relative Pfade lösen manche Dienste nicht auf)', imageUrl)
check(imageUrl.includes(host), `og:image zeigt auf DIESEN Host (nicht auf den Betreiber-Host)`, imageUrl)
check(meta['og:image:width'] === '1200' && meta['og:image:height'] === '630', 'og:image:width/height = 1200×630',
  `${meta['og:image:width']}×${meta['og:image:height']}`)
check(meta['og:image:type'] === 'image/png', 'og:image:type = image/png (SVG zeigen FB/WhatsApp/LinkedIn nicht)', meta['og:image:type'])
check(Boolean(meta['og:image:alt']), 'og:image:alt ist gesetzt', meta['og:image:alt'])
check(meta['twitter:card'] === 'summary_large_image', 'twitter:card = summary_large_image', meta['twitter:card'])
// Der Kopf, der vorher schon da war, muss unberührt bleiben
const canonical = /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/.exec(page.body.toString('utf8'))?.[1] ?? ''
check(canonical.includes(host), 'canonical zeigt weiter auf diesen Host', canonical)
check(Boolean(meta['og:title']) && Boolean(meta['og:description']), 'og:title/og:description unverändert vorhanden')

const path = imageUrl ? new URL(imageUrl).pathname : '/og/0000000.png'
const image = await request(path)
check(image.status === 200, `GET ${path} antwortet 200`, `status ${image.status}`)
check(image.headers['content-type'] === 'image/png', 'content-type image/png', String(image.headers['content-type']))
check(/max-age=31536000/.test(String(image.headers['cache-control'])) && /immutable/.test(String(image.headers['cache-control'])),
  'cache-control ist langlebig + immutable', String(image.headers['cache-control']))

const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
check(signature.every((byte, i) => image.body[i] === byte), 'PNG-Signatur stimmt')
const width = image.body.readUInt32BE(16)
const height = image.body.readUInt32BE(20)
check(width === 1200 && height === 630, 'Bild ist wirklich 1200×630 (aus dem IHDR gelesen)', `${width}×${height}`)
console.log(`  Dateigröße: ${(image.body.length / 1024).toFixed(1)} KB`)

// Zweiter Abruf: muss aus der Ablage kommen und byte-identisch sein
const again = await request(path)
check(again.body.equals(image.body), 'zweiter Abruf ist byte-identisch (Ablage greift)')

const bogus = await request('/og/zzzzzz9.png')
check(bogus.status === 200, 'veralteter Schlüssel liefert das aktuelle Bild statt 404', `status ${bogus.status}`)
const malformed = await request('/og/nicht-erlaubt!.png')
check(malformed.status === 404, 'unpassender Schlüssel wird abgewiesen', `status ${malformed.status}`)

if (save && image.body.length) {
  writeFileSync(save, image.body)
  console.log(`  Bild gespeichert: ${save}`)
}

console.log(failed === 0 ? '\nAlles grün.' : `\n${failed} Prüfung(en) fehlgeschlagen.`)
process.exit(failed === 0 ? 0 : 1)

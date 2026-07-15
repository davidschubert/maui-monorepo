/**
 * S0-Vertrag 1: Mandantenauflösung — dem Host-Header wird nie blind vertraut.
 *
 * - nur normalisierte Hostnamen, die im Sites-Register stehen
 * - unbekannte/mehrdeutige Hosts → null (Aufrufer wirft 404, KEIN Default!)
 * - der zurückgegebene Site-Kontext ist eingefroren und enthält KEINEN Key
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const register = JSON.parse(readFileSync(resolve(here, '../sites-register.json'), 'utf8'))

const sites = new Map()
for (const [hostname, entry] of Object.entries(register)) {
  sites.set(hostname.toLowerCase(), Object.freeze({ ...entry }))
}

export function resolveSite(rawHost) {
  if (!rawHost || typeof rawHost !== 'string') return null
  // Normalisieren: lowercase, Port abschneiden, keine Wildcards/Leerzeichen
  const host = rawHost.trim().toLowerCase().replace(/:\d+$/, '')
  if (!/^[a-z0-9.-]+$/.test(host)) return null
  return sites.get(host) ?? null // ← nie eine Default-Site
}

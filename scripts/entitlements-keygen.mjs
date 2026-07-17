#!/usr/bin/env node
/**
 * entitlements-keygen (F3/M8-Vorbereitung): erzeugt ein Ed25519-Schlüsselpaar
 * für die signierte Entitlement-Zustellung und druckt die Env-Zeilen —
 * privater Schlüssel NUR ins Studio (Aussteller), öffentlicher in die
 * Site-Envs (Prüfer). Rotation: neues Paar mit neuer kid erzeugen, Public-
 * Key-Map der Sites um die neue kid ERWEITERN (alte behalten, bis kein
 * altes Dokument mehr im Umlauf ist), dann Studio auf die neue kid umstellen.
 *
 *   pnpm entitlements:keygen [--kid k1]
 */
import { generateKeyPairSync } from 'node:crypto'

const argv = process.argv.slice(2)
const kidIndex = argv.indexOf('--kid')
const kid = kidIndex >= 0 ? argv[kidIndex + 1] : `k${Date.now().toString(36)}`

if (!/^[a-z0-9-]+$/.test(kid)) {
  console.error(`✗ Ungültige kid „${kid}" — erlaubt: kleinbuchstaben, ziffern, bindestriche`)
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const privateB64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
const publicB64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')

console.log(`Ed25519-Schlüsselpaar erzeugt (kid: ${kid})

── Studio (.env von apps/studio — Aussteller, NIE committen) ──────────────
NUXT_ENTITLEMENTS_PRIVATE_KEY=${privateB64}
NUXT_ENTITLEMENTS_KID=${kid}

── Jede Site (.env — Prüfer; bestehende Map um diese kid erweitern) ───────
NUXT_ENTITLEMENTS_URL=http://localhost:3004/api/platform/entitlements/<projectId>
NUXT_ENTITLEMENTS_PUBLIC_KEYS={"${kid}":"${publicB64}"}
`)

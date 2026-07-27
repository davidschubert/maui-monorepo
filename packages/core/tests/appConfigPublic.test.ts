import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APP_CONFIG,
  DEFAULT_PUBLIC_APP_CONFIG,
  toPublicAppConfig,
  type AppConfig,
} from '../shared/types/config'

/**
 * Audit-Befund K5: `entitlementsDoc` (signiertes kaufmännisches Dokument) reiste
 * über GET /api/config und den useState `maui-runtime-flags` im Klartext in den
 * __NUXT__-Payload JEDER Seite — auch unauthentifiziert (/login). Es hat keinen
 * Client-Leser.
 *
 * Audit-Befund N2 (Nachfolge): der Appwrite-Direktweg umging diese Diät — die
 * Tabelle app_config ist Table-read(any) (system-005, für Realtime-Flags und
 * Theme-Live-Propagation an Gäste) und trug die Spalte `entitlements`. Das
 * Dokument liegt seit system-020 in der server-only Tabelle `app_secrets` und
 * ist KEIN AppConfig-Feld mehr. Diese Tests halten beides fest: AppConfig
 * trägt nichts Server-Only, und die Projektion bleibt die bewusste Naht.
 */
const full: AppConfig = {
  registrationEnabled: false,
  commentsEnabled: false,
  maintenanceMode: true,
  features: { posts: { enabled: false, status: 'inactive' } },
}

describe('toPublicAppConfig', () => {
  it('AppConfig trägt kein Entitlement-Dokument mehr (N2)', () => {
    expect('entitlementsDoc' in DEFAULT_APP_CONFIG).toBe(false)
    expect(JSON.stringify(DEFAULT_APP_CONFIG)).not.toContain('entitlements')
  })

  it('lässt nichts Entitlement-Artiges in den Client-Payload', () => {
    // Ein versehentlich durchgereichtes Server-Feld darf nicht mitreisen —
    // die Projektion kopiert Feld für Feld (kein Rest-Spread)
    const leaky = { ...full, entitlementsDoc: 'eyJ2IjoxfQ.c2lnbmF0dXJl' } as unknown as AppConfig
    const publicConfig = toPublicAppConfig(leaky)
    expect('entitlementsDoc' in publicConfig).toBe(false)
    expect(JSON.stringify(publicConfig)).not.toContain('entitlements')
    expect(JSON.stringify(publicConfig)).not.toContain('c2lnbmF0dXJl')
  })

  it('reicht JEDES vom Client gelesene Flag unverändert durch', () => {
    // Leser: register-Seiten (registrationEnabled/maintenanceMode),
    // useCommentPolicy (commentsEnabled/maintenanceMode), useFeature +
    // Dashboard-Nav (features)
    expect(toPublicAppConfig(full)).toEqual({
      registrationEnabled: false,
      commentsEnabled: false,
      maintenanceMode: true,
      features: { posts: { enabled: false, status: 'inactive' } },
    })
  })

  it('hält genau die Schlüssel der Voll-Config', () => {
    const expected = Object.keys(DEFAULT_APP_CONFIG).sort()
    expect(Object.keys(toPublicAppConfig(full)).sort()).toEqual(expected)
    expect(Object.keys(DEFAULT_PUBLIC_APP_CONFIG).sort()).toEqual(expected)
  })

  it('die öffentlichen Defaults bleiben permissiv wie die Voll-Defaults', () => {
    expect(DEFAULT_PUBLIC_APP_CONFIG).toEqual(toPublicAppConfig(DEFAULT_APP_CONFIG))
  })
})

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
 * Client-Leser. Diese Tests halten die Projektion fest.
 */
const full: AppConfig = {
  registrationEnabled: false,
  commentsEnabled: false,
  maintenanceMode: true,
  features: { posts: { enabled: false, status: 'inactive' } },
  entitlementsDoc: 'eyJ2IjoxfQ.c2lnbmF0dXJl',
}

describe('toPublicAppConfig', () => {
  it('lässt entitlementsDoc weg — auch als Schlüssel (JSON-Payload)', () => {
    const publicConfig = toPublicAppConfig(full)
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

  it('hält genau die Schlüssel der Voll-Config minus entitlementsDoc', () => {
    const expected = Object.keys(DEFAULT_APP_CONFIG).filter(k => k !== 'entitlementsDoc').sort()
    expect(Object.keys(toPublicAppConfig(full)).sort()).toEqual(expected)
    expect(Object.keys(DEFAULT_PUBLIC_APP_CONFIG).sort()).toEqual(expected)
  })

  it('die öffentlichen Defaults bleiben permissiv wie die Voll-Defaults', () => {
    expect(DEFAULT_PUBLIC_APP_CONFIG).toEqual(toPublicAppConfig(DEFAULT_APP_CONFIG))
  })
})

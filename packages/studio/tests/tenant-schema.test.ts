import { describe, expect, it } from 'vitest'
import { tenantCreateSchema, tenantStatusSchema } from '../schemas/tenant'

const valid = { name: 'Kunde A', host: 'kunde-a.pukalani.app', mode: 'pool' as const, projectId: 'pool-1' }

describe('tenantCreateSchema', () => {
  it('akzeptiert kanonische Hosts und lowercased', () => {
    const parsed = tenantCreateSchema.parse({ ...valid, host: 'Kunde-A.Pukalani.App' })
    expect(parsed.host).toBe('kunde-a.pukalani.app')
  })
  it('lehnt Ports, Protokolle, Pfade und nackte Labels ab', () => {
    for (const host of ['kunde:443', 'https://kunde.de', 'kunde.de/pfad', 'localhost', '-bad.de', 'x.']) {
      expect(tenantCreateSchema.safeParse({ ...valid, host }).success, host).toBe(false)
    }
  })
  it('mode nur pool|silo, tenantId optional', () => {
    expect(tenantCreateSchema.safeParse({ ...valid, mode: 'hybrid' }).success).toBe(false)
    expect(tenantCreateSchema.safeParse({ ...valid, tenantId: 't-abc' }).success).toBe(true)
  })
  it('lehnt Sonderzeichen/Umlaute ab (nur a-z, 0-9, Bindestrich)', () => {
    for (const host of ['kundé.pukalani.app', 'kunde_a.pukalani.app', 'kunde a.pukalani.app', 'kunde!.pukalani.app', 'müller.de']) {
      expect(tenantCreateSchema.safeParse({ ...valid, host }).success, host).toBe(false)
    }
    // Punycode ist der erlaubte Weg für internationale Namen
    expect(tenantCreateSchema.safeParse({ ...valid, host: 'xn--mller-kva.de' }).success).toBe(true)
  })
  it('lehnt überlange DNS-Labels ab (>63 Zeichen)', () => {
    const long = `${'a'.repeat(64)}.pukalani.app`
    expect(tenantCreateSchema.safeParse({ ...valid, host: long }).success).toBe(false)
    expect(tenantCreateSchema.safeParse({ ...valid, host: `${'a'.repeat(63)}.pukalani.app` }).success).toBe(true)
  })
  it('reservierte Betreiber-Subdomains sind tabu — fremde Kundendomains frei', () => {
    for (const host of ['studio.pukalani.app', 'api.pukalani.app', 'www.pukalani.app', 'pukalani.app', 'foo.functions.pukalani.app']) {
      expect(tenantCreateSchema.safeParse({ ...valid, host }).success, host).toBe(false)
    }
    expect(tenantCreateSchema.safeParse({ ...valid, host: 'kunde-a.pukalani.app' }).success).toBe(true)
    // 'www' als LABEL fremder Domains bleibt erlaubt
    expect(tenantCreateSchema.safeParse({ ...valid, host: 'www.kunde.de' }).success).toBe(true)
  })
})

describe('tenantStatusSchema', () => {
  it('nur active|disabled', () => {
    expect(tenantStatusSchema.safeParse({ status: 'active' }).success).toBe(true)
    expect(tenantStatusSchema.safeParse({ status: 'deleted' }).success).toBe(false)
  })
})

describe('nameToSubdomain (Name → Subdomain-Vorschlag)', () => {
  it('transliteriert Umlaute und ersetzt Sonderzeichen durch Bindestriche', async () => {
    const { nameToSubdomain } = await import('../schemas/tenant')
    expect(nameToSubdomain('Bäckerei Müller')).toBe('baeckerei-mueller')
    expect(nameToSubdomain('Straßen-Café 24')).toBe('strassen-cafe-24')
    expect(nameToSubdomain('  Kunde!!! ')).toBe('kunde')
    expect(nameToSubdomain('___')).toBe('')
  })
})

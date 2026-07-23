import { describe, expect, it } from 'vitest'
import { checkEmbedHost, hostOfUrl, resolveEmbedOrigins } from '../shared/embedOrigins'

const sites = [
  { host: 'davidschubert.com', targetTypes: [], active: true },
  { host: 'blog.kunde.de', targetTypes: ['blog'], active: true },
  { host: 'alt.kunde.de', targetTypes: [], active: false },
]

describe('resolveEmbedOrigins (E3 Registry → CSP)', () => {
  it('vereint statische Origins mit aktiven Registry-Sites (https)', () => {
    expect(resolveEmbedOrigins(['http://localhost:*'], sites)).toEqual([
      'http://localhost:*',
      'https://davidschubert.com',
      'https://blog.kunde.de',
    ])
  })
  it('inaktive Sites fliegen aus der CSP', () => {
    expect(resolveEmbedOrigins([], sites)).not.toContain('https://alt.kunde.de')
  })
  it('\'*\' in der statischen Liste = offen (Betreiber-Option)', () => {
    expect(resolveEmbedOrigins(['*'], sites)).toEqual(['*'])
  })
  it('dedupliziert', () => {
    expect(resolveEmbedOrigins(['https://davidschubert.com'], sites).filter(o => o === 'https://davidschubert.com')).toHaveLength(1)
  })
})

describe('checkEmbedHost (freundliche /embed-Meldung)', () => {
  it('registrierter Host: allowed; targetTypes-Begrenzung greift', () => {
    expect(checkEmbedHost([], sites, 'https://davidschubert.com/artikel', 'blog')).toBe('allowed')
    expect(checkEmbedHost([], sites, 'https://blog.kunde.de/post', 'blog')).toBe('allowed')
    expect(checkEmbedHost([], sites, 'https://blog.kunde.de/post', 'page')).toBe('target-type-blocked')
  })
  it('unbekannter/inaktiver Host: unknown-host', () => {
    expect(checkEmbedHost([], sites, 'https://fremd.de/x', 'blog')).toBe('unknown-host')
    expect(checkEmbedHost([], sites, 'https://alt.kunde.de/x', 'blog')).toBe('unknown-host')
  })
  it('statisch erlaubte Origins (inkl. Port-Wildcard) brauchen keine Registry', () => {
    expect(checkEmbedHost(['http://localhost:*'], sites, 'http://localhost:4999/', 'blog')).toBe('allowed')
  })
  it('ohne/mit unparsebarem url-Param wird NICHT geblockt (CSP entscheidet)', () => {
    expect(checkEmbedHost([], sites, undefined, 'blog')).toBe('allowed')
    expect(checkEmbedHost([], sites, 'kein-url', 'blog')).toBe('allowed')
  })
  it('\'*\' schaltet die Prüfung ab', () => {
    expect(checkEmbedHost(['*'], sites, 'https://fremd.de/x', 'blog')).toBe('allowed')
  })
})

describe('hostOfUrl', () => {
  it('lowercased hostname, \'\' bei Müll', () => {
    expect(hostOfUrl('https://Blog.Kunde.DE/pfad?x=1')).toBe('blog.kunde.de')
    expect(hostOfUrl('nix')).toBe('')
    expect(hostOfUrl(undefined)).toBe('')
  })
})

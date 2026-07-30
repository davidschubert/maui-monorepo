import { describe, expect, it } from 'vitest'
import { rebaseSeoLinks, rebaseSeoMeta, rebaseSeoUrl, resolveSeoOrigin, toSeoHeadLinks, toSeoHeadMeta } from '../shared/seoOrigin'

const POOL_BASE = 'https://platform.pukalani.app'

/** Kopf, wie useLocaleHead ihn im Pool liefert (Basis = Betreiber-Host). */
function poolHead() {
  return {
    link: [
      { id: 'i18n-xd', rel: 'alternate', href: `${POOL_BASE}/feed`, hreflang: 'x-default' },
      { id: 'i18n-alt-en', rel: 'alternate', href: `${POOL_BASE}/feed`, hreflang: 'en' },
      { id: 'i18n-alt-de', rel: 'alternate', href: `${POOL_BASE}/de/feed`, hreflang: 'de' },
      { id: 'i18n-can', rel: 'canonical', href: `${POOL_BASE}/de/feed` },
      { rel: 'icon', href: '/favicon.ico' },
    ],
    meta: [
      { id: 'i18n-og-url', property: 'og:url', content: `${POOL_BASE}/de/feed` },
      { id: 'i18n-og', property: 'og:locale', content: 'de_DE' },
      { id: 'i18n-og-alt-en-US', property: 'og:locale:alternate', content: 'en_US' },
    ],
  }
}

describe('SEO-Origin auflösen', () => {
  it('nimmt Host+Port aus dem Request', () => {
    expect(resolveSeoOrigin('https://demo.pukalani.app', POOL_BASE)).toBe('https://demo.pukalani.app')
    expect(resolveSeoOrigin('http://demo.localhost:3106', '')).toBe('http://demo.localhost:3106')
  })

  it('nimmt das SCHEMA aus der konfigurierten Basis (nginx spricht intern http)', () => {
    // Der Node-Prozess sieht http; ob der Proxy X-Forwarded-Proto setzt, ist
    // Server-Konfiguration — die Env bleibt die Autorität für https.
    expect(resolveSeoOrigin('http://kunde-a.pukalani.app', POOL_BASE)).toBe('https://kunde-a.pukalani.app')
    expect(resolveSeoOrigin('http://demo.localhost:3106', POOL_BASE)).toBe('https://demo.localhost:3106')
  })

  it('behält das Request-Schema, wenn keine Basis konfiguriert ist (lokal)', () => {
    for (const configured of ['', undefined, null, 'kein-url']) {
      expect(resolveSeoOrigin('http://demo.localhost:3106', configured)).toBe('http://demo.localhost:3106')
    }
  })

  it('liefert leer bei unbrauchbarem Request-Origin (Kopf bleibt dann unverändert)', () => {
    for (const raw of ['', undefined, null, 'demo.pukalani.app']) {
      expect(resolveSeoOrigin(raw, POOL_BASE)).toBe('')
    }
  })
})

describe('Kopf-URLs umschreiben', () => {
  it('ersetzt den Origin und lässt Pfad + Query stehen', () => {
    expect(rebaseSeoUrl(`${POOL_BASE}/de/feed?page=2`, 'https://demo.pukalani.app'))
      .toBe('https://demo.pukalani.app/de/feed?page=2')
  })

  it('macht relative Werte absolut (Basis-URL nicht gesetzt)', () => {
    expect(rebaseSeoUrl('/de/feed', 'http://demo.localhost:3106')).toBe('http://demo.localhost:3106/de/feed')
    expect(rebaseSeoUrl('/', 'http://demo.localhost:3106')).toBe('http://demo.localhost:3106/')
  })

  it('gibt unbrauchbare Werte unverändert zurück', () => {
    expect(rebaseSeoUrl('', 'https://demo.pukalani.app')).toBe('')
    expect(rebaseSeoUrl('/de/feed', '')).toBe('/de/feed')
    expect(rebaseSeoUrl('/de/feed', 'kein-origin')).toBe('/de/feed')
  })
})

describe('useLocaleHead-Kopf auf den Request-Host ziehen (Befund B1)', () => {
  const origin = 'https://demo.pukalani.app'

  it('zieht canonical UND alle hreflang-Alternates auf den Request-Host', () => {
    const links = rebaseSeoLinks(poolHead().link, origin)
    expect(links.filter(l => l.rel === 'alternate').map(l => l.href)).toEqual([
      `${origin}/feed`, `${origin}/feed`, `${origin}/de/feed`,
    ])
    expect(links.find(l => l.rel === 'canonical')?.href).toBe(`${origin}/de/feed`)
    // hreflang-Zuordnung + Dedupe-Ids bleiben erhalten
    expect(links[2]).toEqual({ id: 'i18n-alt-de', rel: 'alternate', href: `${origin}/de/feed`, hreflang: 'de' })
  })

  it('lässt fremde Links (favicon & Co.) unberührt', () => {
    expect(rebaseSeoLinks(poolHead().link, origin).at(-1)).toEqual({ rel: 'icon', href: '/favicon.ico' })
  })

  it('zieht og:url mit, og:locale bleibt', () => {
    const meta = rebaseSeoMeta(poolHead().meta, origin)
    expect(meta[0]?.content).toBe(`${origin}/de/feed`)
    expect(meta[1]).toEqual({ id: 'i18n-og', property: 'og:locale', content: 'de_DE' })
    expect(meta[2]).toEqual({ id: 'i18n-og-alt-en-US', property: 'og:locale:alternate', content: 'en_US' })
  })

  it('ohne Origin (Gate aus / Silo-App) bleibt JEDER Eintrag wie er war', () => {
    const head = poolHead()
    expect(rebaseSeoLinks(head.link, '')).toEqual(head.link)
    expect(rebaseSeoMeta(head.meta, '')).toEqual(head.meta)
  })
})

/**
 * Die Naht zu unhead 3 (Nuxt 4.5): dort ist ein link-/meta-Eintrag eine über
 * `rel` bzw. `name`/`property` DISKRIMINIERTE Union, und `Record<string, string>`
 * — wie @nuxtjs/i18n seine Einträge typisiert — passt in kein Mitglied.
 * Diese Tests nageln fest, dass die Umformung nichts am INHALT ändert.
 */
describe('Kopf-Einträge in die unhead-Form bringen', () => {
  it('behält canonical und jeden Alternate mit Ziel, hreflang und Dedupe-Id', () => {
    expect(toSeoHeadLinks(poolHead().link)).toEqual([
      { id: 'i18n-xd', rel: 'alternate', href: `${POOL_BASE}/feed`, hreflang: 'x-default' },
      { id: 'i18n-alt-en', rel: 'alternate', href: `${POOL_BASE}/feed`, hreflang: 'en' },
      { id: 'i18n-alt-de', rel: 'alternate', href: `${POOL_BASE}/de/feed`, hreflang: 'de' },
      { id: 'i18n-can', rel: 'canonical', href: `${POOL_BASE}/de/feed` },
    ])
  })

  it('nimmt NUR die zwei Formen, die useLocaleHead erzeugt', () => {
    // Das favicon im Fixture ist Absicht: useLocaleHead liefert so etwas nicht
    // (nur canonical + alternate, s. i18n dist/runtime/kit/head.js). Im Kopf
    // steht es trotzdem — der themes-Layer setzt es mit einem EIGENEN useHead.
    expect(toSeoHeadLinks(poolHead().link).some(l => l.rel === 'icon')).toBe(false)
    expect(toSeoHeadLinks([{ rel: 'stylesheet', href: '/x.css' }])).toEqual([])
  })

  it('ein Alternate ohne Ziel behält sein leeres href (x-default ohne Gegenstück)', () => {
    expect(toSeoHeadLinks([{ id: 'i18n-xd', rel: 'alternate', hreflang: 'x-default' } as Record<string, string>]))
      .toEqual([{ id: 'i18n-xd', rel: 'alternate', href: '', hreflang: 'x-default' }])
  })

  it('trägt property- und name-Metas mit Inhalt und Id durch', () => {
    expect(toSeoHeadMeta(poolHead().meta)).toEqual(poolHead().meta)
    expect(toSeoHeadMeta([{ name: 'twitter:card', content: 'summary_large_image' }]))
      .toEqual([{ name: 'twitter:card', content: 'summary_large_image', id: undefined }])
  })
})

import { describe, expect, it } from 'vitest'
import { createImage, defineProvider } from '@nuxt/image/runtime'
import {
  STORAGE_PREVIEW_DEFAULT_QUALITY,
  storageProviderImageUrl,
} from '../shared/storageImage'

/**
 * Der Anbieter `appwrite` IM ZUSAMMENSPIEL mit @nuxt/image.
 *
 * Warum das eigene Tests braucht, obwohl storageImage.test.ts den URL-Bau schon
 * abdeckt: die Größen-Rechnung gehört @nuxt/image, und ihre `sizes`-Syntax hat
 * eine Falle, die man ohne Beweis nicht sieht (siehe erster Test unten). Der
 * echte Anbieter besteht NUR aus dem Aufruf von `storageProviderImageUrl` — was
 * hier läuft, ist also Zeile für Zeile derselbe Code.
 */
const BASE = { endpoint: 'https://aw.test/v1', projectId: 'p1' }

/** Was die Aufrufstellen an `<NuxtImg :src>` reichen: die Original-URL. */
const SRC = `${BASE.endpoint}/storage/buckets/media/files/f1/view?project=${BASE.projectId}`

/** Spiegelt core/nuxt.config.ts — dieselben Defaults, damit der Test misst,
 *  was die Apps wirklich bekommen. */
function makeImage() {
  return createImage({
    providers: {
      appwrite: {
        setup: defineProvider({
          getImage: (src, { modifiers }) => ({
            url: storageProviderImageUrl(src, modifiers),
          }),
        }),
        defaults: {},
      },
    },
    provider: 'appwrite',
    presets: {},
    nuxt: { baseURL: '/' },
    screens: { xs: 320, sm: 640, md: 768, lg: 1024, xl: 1280, xxl: 1536, '2xl': 1536 },
    alias: {},
    domains: [],
    densities: [1, 2],
    format: ['webp'],
    quality: STORAGE_PREVIEW_DEFAULT_QUALITY,
  })
}

/** Breiten aus einem srcset, aufsteigend. */
function widthsOf(srcset: string): number[] {
  return srcset
    .split(', ')
    .map(part => Number.parseInt(part.split(' ')[1] ?? '', 10))
    .sort((a, b) => a - b)
}

describe('sizes-Syntax von @nuxt/image', () => {
  it('FALLE: eine Stufe OHNE Präfix ergibt ein 1-Pixel-Bild', () => {
    // `sizes="100vw"` liest @nuxt/image als Schlüssel '1px' (parseSizes), und
    // daraus wird eine Bildschirmbreite von 1 px. Das Ergebnis ist kein Fehler,
    // sondern ein srcset mit `1w, 2w` — also ein unbrauchbares Bild, das nirgends
    // auffällt. JEDE Aufrufstelle in diesem Repo schreibt deshalb `xs:100vw`.
    // Der Test hält die Falle fest, damit sie nicht zurückkehrt.
    const bad = makeImage().getSizes(SRC, { sizes: '100vw' })
    expect(widthsOf(bad.srcset)).toEqual([1, 2])

    const good = makeImage().getSizes(SRC, { sizes: 'xs:100vw' })
    expect(widthsOf(good.srcset)).toEqual([320, 640])
  })

  it('setzt aus benannten Stufen die passenden Media-Queries', () => {
    const r = makeImage().getSizes(SRC, { sizes: 'xs:100vw sm:50vw lg:400px' })
    expect(r.sizes).toBe('(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 400px')
    expect(widthsOf(r.srcset)).toEqual([320, 400, 640, 800])
  })

  it('nimmt auch rohe Pixel-Schlüssel — dafür braucht eine App keine eigenen screens', () => {
    // Die Foto-Galerie bricht bei 520 und 860 px um; das sind keine
    // Tailwind-Stufen. Der Schlüssel ist die UNTERE Kante des Bandes, die
    // Media-Query kommt aus dem NÄCHSTEN Schlüssel.
    const r = makeImage().getSizes(SRC, {
      sizes: '320:100vw 521:50vw 861:33vw 1920:33vw',
    })
    expect(r.sizes).toBe(
      '(max-width: 520px) 100vw, (max-width: 860px) 50vw, (max-width: 1919px) 33vw, 33vw',
    )
    expect(widthsOf(r.srcset).at(-1)).toBe(1268)
  })

  it('erzeugt ohne sizes eine reine Dichte-Auswahl (1x/2x)', () => {
    const r = makeImage().getSizes(SRC, { modifiers: { width: 80, height: 48 } })
    expect(r.sizes).toBeUndefined()
    expect(r.srcset).toContain('width=80')
    expect(r.srcset).toContain('width=160')
    expect(r.srcset).toContain(' 1x')
    expect(r.srcset).toContain(' 2x')
  })
})

describe('Anbieter am @nuxt/image-Vertrag', () => {
  it('baut jede srcset-Fassung als Appwrite-Vorschau in WebP', () => {
    const r = makeImage().getSizes(SRC, { sizes: 'xs:100vw lg:320px' })
    for (const part of r.srcset.split(', ')) {
      expect(part).toContain('/storage/buckets/media/files/f1/preview?')
      expect(part).toContain('output=webp')
      expect(part).toContain('project=p1')
    }
  })

  it('nimmt eine fertige Vorschau-URL als Eingabe (API-Antworten liefern die)', () => {
    const src = `${BASE.endpoint}/storage/buckets/media/files/f9/preview?width=960&output=webp&project=p1`
    const r = makeImage().getSizes(src, { sizes: 'xs:100vw lg:320px' })
    expect(widthsOf(r.srcset)).toEqual([320, 640])
    expect(r.srcset).toContain('/files/f9/preview?')
    expect(r.srcset).not.toContain('width=960')
  })

  it('lässt ein statisches Bild unangetastet — der Anbieter darf global gelten', () => {
    const r = makeImage().getImage('/images/gallery/makani.svg', { modifiers: { width: 400 } })
    expect(r.url).toBe('/images/gallery/makani.svg')
  })

  it('reicht ein ausdrückliches Format bis in die URL durch', () => {
    const r = makeImage().getImage(SRC, {
      modifiers: { width: 640, format: 'avif' },
    })
    expect(r.url).toContain('output=avif')
  })
})

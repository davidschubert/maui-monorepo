import { describe, expect, it } from 'vitest'
import {
  STORAGE_PREVIEW_DEFAULT_QUALITY,
  STORAGE_PREVIEW_FORMATS,
  STORAGE_PREVIEW_MAX_EDGE,
  parseStorageImageUrl,
  storageFileUrl,
  storageImageUrl,
  storageProviderImageUrl,
} from '../shared/storageImage'

const BASE = { endpoint: 'https://api.example.app/v1', projectId: 'pool' }

describe('storageFileUrl', () => {
  it('liefert die Original-URL über /view', () => {
    expect(storageFileUrl(BASE, 'media', 'f1'))
      .toBe('https://api.example.app/v1/storage/buckets/media/files/f1/view?project=pool')
  })
})

describe('storageImageUrl', () => {
  it('fällt OHNE Optionen auf die Original-URL zurück (altes Verhalten)', () => {
    expect(storageImageUrl(BASE, 'media', 'f1'))
      .toBe(storageFileUrl(BASE, 'media', 'f1'))
  })

  it('nutzt /preview, sobald eine Größe gewünscht ist', () => {
    const url = storageImageUrl(BASE, 'media', 'f1', { width: 640 })
    expect(url).toContain('/files/f1/preview?')
    expect(url).toContain('width=640')
    expect(url).toContain('project=pool')
  })

  it('reicht height, quality und output durch', () => {
    const url = storageImageUrl(BASE, 'media', 'f1', {
      width: 320, height: 240, quality: 70, output: 'webp',
    })
    expect(url).toContain('width=320')
    expect(url).toContain('height=240')
    expect(url).toContain('quality=70')
    expect(url).toContain('output=webp')
  })

  it('klemmt Kantenlängen auf das Appwrite-Maximum statt einen 400er zu bauen', () => {
    const url = storageImageUrl(BASE, 'media', 'f1', { width: 9000 })
    expect(url).toContain(`width=${STORAGE_PREVIEW_MAX_EDGE}`)
    expect(url).not.toContain('width=9000')
  })

  it('klemmt quality in 0..100', () => {
    expect(storageImageUrl(BASE, 'media', 'f1', { quality: 150 })).toContain('quality=100')
    expect(storageImageUrl(BASE, 'media', 'f1', { quality: -5 })).toContain('quality=0')
  })

  it('ignoriert unsinnige Größen (0 oder negativ) statt sie zu senden', () => {
    const url = storageImageUrl(BASE, 'media', 'f1', { width: 0, output: 'webp' })
    expect(url).not.toContain('width=')
    expect(url).toContain('output=webp')
  })

  it('rundet Bruchzahlen — Appwrite erwartet Ganzzahlen', () => {
    expect(storageImageUrl(BASE, 'media', 'f1', { width: 321.6 })).toContain('width=322')
  })

  it('setzt allein für ein Format schon /preview (Format ohne Größe ist gültig)', () => {
    expect(storageImageUrl(BASE, 'media', 'f1', { output: 'webp' })).toContain('/preview?')
  })
})

/* -------------------------------------------------------------------------- *
 * Schritt 2 (C14) — der reine Kern des @nuxt/image-Anbieters `appwrite`.
 * Der Anbieter selbst hat keine eigene Logik; wenn diese Tests halten, hält er.
 * -------------------------------------------------------------------------- */

describe('parseStorageImageUrl', () => {
  it('zerlegt eine /view-URL (das liefert coverSource)', () => {
    expect(parseStorageImageUrl(storageFileUrl(BASE, 'media', 'f1'))).toEqual({
      endpoint: BASE.endpoint,
      projectId: BASE.projectId,
      bucketId: 'media',
      fileId: 'f1',
    })
  })

  it('zerlegt eine /preview-URL samt Größen-Query (das liefert /api/media)', () => {
    expect(parseStorageImageUrl(storageImageUrl(BASE, 'media', 'f1', { width: 640, output: 'webp' })))
      .toEqual({
        endpoint: BASE.endpoint,
        projectId: BASE.projectId,
        bucketId: 'media',
        fileId: 'f1',
      })
  })

  it('zerlegt /download (Anhänge zeigen dorthin)', () => {
    expect(parseStorageImageUrl('https://x/v1/storage/buckets/b/files/f/download?project=p'))
      .toEqual({ endpoint: 'https://x/v1', projectId: 'p', bucketId: 'b', fileId: 'f' })
  })

  it('verlangt den project-Parameter — ohne ihn ordnet Appwrite nichts zu', () => {
    expect(parseStorageImageUrl('https://x/v1/storage/buckets/b/files/f/view')).toBeNull()
    expect(parseStorageImageUrl('https://x/v1/storage/buckets/b/files/f/preview?width=100')).toBeNull()
  })

  it('lässt statische Bilder in Ruhe — sonst würde /images/hero.jpg umgeschrieben', () => {
    expect(parseStorageImageUrl('/images/hero.jpg')).toBeNull()
    expect(parseStorageImageUrl('/images/gallery/makani.svg')).toBeNull()
  })

  it('lässt fremde URLs, data:-URIs und Leeres in Ruhe', () => {
    expect(parseStorageImageUrl('https://cdn.example.com/a.png')).toBeNull()
    expect(parseStorageImageUrl('data:image/png;base64,AAAA')).toBeNull()
    expect(parseStorageImageUrl('')).toBeNull()
    expect(parseStorageImageUrl('   ')).toBeNull()
  })

  it('greift NICHT bei einer Storage-Route ohne Bild-Endpunkt', () => {
    expect(parseStorageImageUrl('https://x/v1/storage/buckets/b/files/f?project=p')).toBeNull()
  })
})

describe('storageProviderImageUrl', () => {
  const SRC = storageFileUrl(BASE, 'media', 'f1')

  it('liefert OHNE Format WebP — nicht AVIF (Messung 2026-07-31)', () => {
    const url = storageProviderImageUrl(SRC, { width: 640 })
    expect(url).toContain('output=webp')
    expect(url).not.toContain('avif')
  })

  it('macht aus der Original-URL IMMER eine /preview-URL, nie das Original', () => {
    expect(storageProviderImageUrl(SRC)).toContain('/preview?')
    expect(storageProviderImageUrl(SRC)).not.toContain('/view?')
  })

  it('setzt die Standard-Qualität, wenn keine genannt ist', () => {
    expect(storageProviderImageUrl(SRC, { width: 640 }))
      .toContain(`quality=${STORAGE_PREVIEW_DEFAULT_QUALITY}`)
  })

  it('nimmt AVIF, wenn es ausdrücklich verlangt wird', () => {
    expect(storageProviderImageUrl(SRC, { width: 640, format: 'avif' })).toContain('output=avif')
  })

  it('akzeptiert jedes Format, das Appwrite 1.9.6 kennt', () => {
    for (const format of STORAGE_PREVIEW_FORMATS) {
      expect(storageProviderImageUrl(SRC, { format })).toContain(`output=${format}`)
    }
  })

  it('ignoriert ein unbekanntes Format statt es durchzureichen (Appwrite antwortet sonst 400)', () => {
    expect(storageProviderImageUrl(SRC, { width: 640, format: 'jxl' })).toContain('output=webp')
  })

  it('nimmt Format-Angaben in Großschreibung an', () => {
    expect(storageProviderImageUrl(SRC, { format: 'AVIF' })).toContain('output=avif')
  })

  it('nimmt Breite/Höhe/Qualität auch als String (Templates liefern Strings)', () => {
    const url = storageProviderImageUrl(SRC, { width: '320', height: '240', quality: '55' })
    expect(url).toContain('width=320')
    expect(url).toContain('height=240')
    expect(url).toContain('quality=55')
  })

  it('klemmt die Kante bei 4000 px, wie Appwrite es verlangt', () => {
    expect(storageProviderImageUrl(SRC, { width: 9000 }))
      .toContain(`width=${STORAGE_PREVIEW_MAX_EDGE}`)
  })

  it('erzeugt aus winzigen Maßen den Platzhalter (LQIP)', () => {
    const url = storageProviderImageUrl(SRC, { width: 20, quality: 40 })
    expect(url).toContain('width=20')
    expect(url).toContain('quality=40')
    expect(url).toContain('output=webp')
  })

  it('rechnet eine fertige Vorschau-URL neu aus, statt sie zu verdoppeln', () => {
    const alt = storageImageUrl(BASE, 'media', 'f1', { width: 960, quality: 78, output: 'webp' })
    const neu = storageProviderImageUrl(alt, { width: 320 })
    expect(neu).toContain('width=320')
    expect(neu).not.toContain('width=960')
    expect(neu.split('/preview?')).toHaveLength(2)
  })

  it('reicht durch, was keine Appwrite-Storage-URL ist', () => {
    expect(storageProviderImageUrl('/images/hero.jpg', { width: 640 })).toBe('/images/hero.jpg')
    expect(storageProviderImageUrl('https://cdn.example.com/a.png', { width: 640 }))
      .toBe('https://cdn.example.com/a.png')
  })

  it('behält Instanz und Projekt aus der Eingabe — jede App hat ihre eigene', () => {
    const other = { endpoint: 'https://aw.other.app/v1', projectId: 'silo' }
    const url = storageProviderImageUrl(storageFileUrl(other, 'media', 'f1'), { width: 100 })
    expect(url.startsWith('https://aw.other.app/v1/storage/buckets/media/files/f1/preview?')).toBe(true)
    expect(url).toContain('project=silo')
  })
})

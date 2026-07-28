import { describe, expect, it } from 'vitest'
import {
  STORAGE_PREVIEW_MAX_EDGE,
  storageFileUrl,
  storageImageSrcset,
  storageImageUrl,
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

describe('storageImageSrcset', () => {
  it('baut Kandidaten mit w-Deskriptor, aufsteigend sortiert', () => {
    const set = storageImageSrcset(BASE, 'media', 'f1', [800, 400], { output: 'webp' })
    const parts = set.split(', ')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain('width=400')
    expect(parts[0]!.endsWith(' 400w')).toBe(true)
    expect(parts[1]!.endsWith(' 800w')).toBe(true)
  })

  it('entfernt Doppelte und Unsinn', () => {
    const set = storageImageSrcset(BASE, 'media', 'f1', [400, 400, 0, -1])
    expect(set.split(', ')).toHaveLength(1)
  })

  it('ist leer, wenn keine brauchbare Breite übrig bleibt', () => {
    expect(storageImageSrcset(BASE, 'media', 'f1', [0, -3])).toBe('')
  })
})

/**
 * Minimaler PNG-Schreiber (Truecolor, 8 bit) — server-only, node:zlib.
 *
 * Warum von Hand und nicht mit einer Bibliothek: die Bildmarken-Karte
 * (brandCardPng.ts) ist das EINZIGE Bild, das diese Plattform erzeugt, und sie
 * braucht von PNG genau vier Blöcke — Signatur, IHDR, IDAT, IEND. Das ist
 * weniger Code als das Einbinden von sharp/resvg/canvas, und vor allem: kein
 * natives Binary, das bei jedem Deploy zur Architektur der Maschine passen
 * muss. Die Kompression selbst macht node:zlib, also die Bibliothek, die in
 * Node ohnehin steckt.
 *
 * Format-Grundlage: PNG-Spezifikation (W3C/ISO 15948) — Farbtyp 2 (RGB),
 * Bittiefe 8, Interlace 0. Bewusst OHNE Alpha-Kanal: die Karte ist immer
 * vollflächig deckend, und ein vierter Kanal wäre ein Viertel mehr Bytes durch
 * die Kompression.
 */
import { deflate } from 'node:zlib'
import { promisify } from 'node:util'

/**
 * Bewusst die ASYNCHRONE Variante: `deflateSync` auf 2,3 MB kostet bei Stufe 9
 * ~280 ms und blockiert dabei den Event-Loop — auf einem Prozess, der viele
 * Mandanten-Hosts bedient, würden also ALLE anderen Requests warten, nur weil
 * ein Crawler das erste Mal eine Karte abholt. Die asynchrone Fassung rechnet in
 * Node's Threadpool: gleiche Bytes, gleiche Stufe, aber der Prozess bleibt
 * ansprechbar.
 */
const deflateAsync = promisify(deflate)

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Ein PNG-Chunk: Länge, Typ, Daten, CRC über Typ+Daten. */
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * Zeilenfilter je Scanline wählen (PNG-Filter 0/1/2).
 *
 * Der Filter ist der Grund, warum ein PNG dieser Karte ~40 KB statt 2,3 MB
 * wiegt: „Sub" (Differenz zum linken Pixel) macht aus einer Fläche gleicher
 * Farbe eine Reihe Nullen, „Up" (Differenz zur Zeile darüber) dasselbe für
 * einen senkrechten Verlauf. Gewählt wird zeilenweise nach der Heuristik der
 * PNG-Spezifikation (kleinste Summe der absoluten Abweichungen).
 */
function filterRow(row: Uint8Array, prev: Uint8Array, bpp: number, out: Uint8Array): number {
  const len = row.length
  let sumNone = 0
  let sumSub = 0
  let sumUp = 0
  for (let i = 0; i < len; i++) {
    const raw = row[i]!
    const left = i >= bpp ? row[i - bpp]! : 0
    const up = prev[i]!
    sumNone += raw < 128 ? raw : 256 - raw
    const sub = (raw - left) & 0xff
    sumSub += sub < 128 ? sub : 256 - sub
    const upd = (raw - up) & 0xff
    sumUp += upd < 128 ? upd : 256 - upd
  }
  const best = Math.min(sumNone, sumSub, sumUp)
  if (best === sumSub) {
    for (let i = 0; i < len; i++) out[i] = (row[i]! - (i >= bpp ? row[i - bpp]! : 0)) & 0xff
    return 1
  }
  if (best === sumUp) {
    for (let i = 0; i < len; i++) out[i] = (row[i]! - prev[i]!) & 0xff
    return 2
  }
  out.set(row)
  return 0
}

/**
 * RGB-Puffer (3 Bytes je Pixel, zeilenweise) → PNG-Datei.
 *
 * @param width Bildbreite in Pixeln
 * @param height Bildhöhe in Pixeln
 * @param rgb Länge muss width*height*3 sein
 */
export async function encodePngRgb(width: number, height: number, rgb: Uint8Array): Promise<Buffer> {
  const bpp = 3
  const stride = width * bpp
  if (rgb.length !== stride * height) {
    throw new Error(`PNG: ${rgb.length} Bytes für ${width}×${height} erwartet ${stride * height}`)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 2 // Farbtyp: Truecolor RGB
  ihdr[10] = 0 // Kompression: deflate
  ihdr[11] = 0 // Filter-Methode: adaptiv
  ihdr[12] = 0 // kein Interlacing

  const raw = Buffer.alloc((stride + 1) * height)
  const prev = new Uint8Array(stride)
  const filtered = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const row = rgb.subarray(y * stride, y * stride + stride)
    const type = filterRow(row, prev, bpp, filtered)
    raw[y * (stride + 1)] = type
    Buffer.from(filtered).copy(raw, y * (stride + 1) + 1)
    prev.set(row)
  }

  // Stufe 9: die Karte entsteht EINMAL je Community und wird danach von Platte
  // bzw. aus dem HTTP-Cache geliefert — hier zählt die Dateigröße (Stufe 9
  // spart gegenüber der Standardstufe rund 17 %), nicht die Rechenzeit.
  const idat = await deflateAsync(raw, { level: 9 })

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ])
}

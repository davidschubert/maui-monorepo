import { defineProvider } from '@nuxt/image/runtime'
import { storageProviderImageUrl } from '../../shared/storageImage'

/**
 * @nuxt/image-Anbieter `appwrite` — Bild-Naht Schritt 2 (C14).
 *
 * WARUM ER SO KLEIN IST: Appwrite transformiert selbst
 * (`/storage/buckets/{b}/files/{f}/preview` mit width/height/quality/output)
 * und cacht das Ergebnis. Dieser Anbieter ist deshalb ein reiner URL-BAUER —
 * auf dem App-Server läuft KEINE Bildverarbeitung. Genau deswegen ist `ipx`
 * (und damit `sharp` samt libvips-Binaries) in pnpm-workspace.yaml als
 * optionale Abhängigkeit ausgeschlossen: es gäbe hier nichts für sie zu tun.
 *
 * Gemessen am 2026-07-31 gegen Appwrite 1.9.6 (lokal): `output` akzeptiert
 * jpg/jpeg/png/webp/heic/avif/gif, der zweite Abruf derselben Variante kommt
 * aus dem Cache (~5 ms statt 120–350 ms).
 *
 * DIESE DATEI DARF NICHTS NUXT-EIGENES IMPORTIEREN — kein `#imports`, keine
 * Auto-Imports, keine runtimeConfig. @nuxt/image referenziert die Typ-Vorlage
 * jedes eigenen Anbieters in ALLEN VIER generierten tsconfigs (nitro, nuxt,
 * node, shared); in zweien davon gibt es diese Namen nicht. Der ausführliche
 * Grund samt Preis steht in core/shared/storageImage.ts über
 * `parseStorageImageUrl`.
 *
 * Deshalb kommt der Endpoint auch nicht aus der Konfiguration, sondern aus dem
 * `src` selbst: die Aufrufstellen reichen die URL herein, die die Bild-Naht aus
 * Schritt 1 ohnehin baut (`useEventCover().coverUrl`, `src` aus /api/media).
 * Was keine Appwrite-Storage-URL ist (statisches Bild, fremdes CDN), kommt
 * unverändert zurück — der Anbieter darf global als Default eingestellt sein,
 * ohne solche Bilder anzufassen.
 */
export default defineProvider({
  getImage: (src, { modifiers }) => ({
    url: storageProviderImageUrl(src, modifiers),
  }),
})

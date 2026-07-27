import { defineContentConfig, defineCollection, z } from '@nuxt/content'

/**
 * ZWEI Sammlungen, weil es zwei Leserschaften gibt:
 *  - `anleitung`  — Betreiber einer Community (keine Technik-Vorkenntnisse)
 *  - `entwickler` — wer das Widget einbindet oder die API anspricht
 *
 * Getrennte Sammlungen statt einer mit Ordner-Konvention: so hat jeder
 * Abschnitt seine eigene Navigation UND seinen eigenen Suchindex — die
 * Kopfzeile schaltet zwischen beiden um. Der `prefix` hält Route und
 * Content-Pfad deckungsgleich (`/anleitung/...`, `/entwickler/...`).
 */
export default defineContentConfig({
  collections: {
    landing: defineCollection({
      type: 'page',
      source: 'index.md',
    }),
    anleitung: defineCollection({
      type: 'page',
      source: { include: 'anleitung/**', prefix: '/anleitung' },
      schema: z.object({
        // Optionale Buttons im Seitenkopf (UPageHeader #links)
        links: z.array(z.object({
          label: z.string(),
          icon: z.string(),
          to: z.string(),
          target: z.string().optional(),
        })).optional(),
      }),
    }),
    entwickler: defineCollection({
      type: 'page',
      source: { include: 'entwickler/**', prefix: '/entwickler' },
      schema: z.object({
        links: z.array(z.object({
          label: z.string(),
          icon: z.string(),
          to: z.string(),
          target: z.string().optional(),
        })).optional(),
      }),
    }),
  },
})

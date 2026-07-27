import { fileURLToPath } from 'node:url'
import { defineContentConfig, defineCollection } from '@nuxt/content'

/**
 * Interne Projekt-Doku im Betreiber-Bereich (Davids Entscheidung 2026-07-28):
 * control.pukalani.app/docs rendert DIESELBEN Markdown-Quellen wie die
 * eigenständige Docs-App auf Port 4000 — `docs/content/**`.
 *
 * EINE Quelle, zwei Konsumenten: hier wird NICHTS kopiert und NICHTS
 * synchronisiert, der Collection-Source zeigt per `cwd` direkt in das
 * Repo-Verzeichnis. Wer dort eine Datei ändert, ändert beide Ansichten.
 *
 * `prefix: '/docs'` hängt den Bereichs-Pfad an die generierten Content-Pfade
 * (`docs/content/2.architektur/6.hosts-und-ports.md` → `/docs/architektur/
 * hosts-und-ports`), damit die Doku im Betreiber-Router unter /docs lebt und
 * nicht mit der Startseite der App kollidiert.
 *
 * ACHTUNG: `docs/content/**` gehört der Docs-App — hier nur LESEN.
 */
const internalDocsCwd = fileURLToPath(new URL('../../docs/content', import.meta.url))

export default defineContentConfig({
  collections: {
    internalDocs: defineCollection({
      type: 'page',
      source: {
        include: '**/*.md',
        cwd: internalDocsCwd,
        prefix: '/docs',
      },
    }),
  },
})

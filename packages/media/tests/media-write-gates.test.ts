import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Die Schreib-Gates der Medien-Routen (Audit-Befunde 2026-08-01).
 *
 * WARUM AM QUELLTEXT UND NICHT LIVE: die Routen laufen nur in Silo-Apps
 * (photos, comments) — `apps/platform` komponiert `media` heute nicht. Ein
 * Live-Beweis „in einer gesperrten Community ist der Upload zu" ist damit
 * nirgends fahrbar: im Silo gibt es keine Community, und im Pool gibt es die
 * Route nicht. Genau deshalb ist der Befund LATENT und feuert erst beim Umzug
 * in den Pool — und genau deshalb muss die Entscheidung hier festgenagelt sein,
 * bevor jemand sie beim Umzug nachträglich sucht. Dasselbe Muster benutzt
 * `core/tests/communitySuspension.test.ts` für den Fehler-Envelope.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const upload = read('../server/api/media/index.post.ts')
const patch = read('../server/api/media/[id].patch.ts')
const remove = read('../server/api/media/[id].delete.ts')
const permissions = read('../server/utils/mediaPermissions.ts')

describe('Medien-Schreibwege handeln als MITGLIED, nicht als Betreiber', () => {
  /**
   * Die Klinke bleibt 'operator' (media_items trägt seit media-002 keine
   * Table-Permissions, ein Session-Client darf dort nicht schreiben) — aber
   * gehandelt hat die Redaktion der Community. Ohne die Trennung meldeten sich
   * alle vier Stellen still von der Inhalts-Sperre ab.
   */
  it.each([
    ['Upload', upload],
    ['Metadaten/Veröffentlichen', patch],
    ['Löschen', remove],
    ['Sichtbarkeit angleichen', permissions],
  ])('%s: as operator, actor member', (_label, source) => {
    expect(source).toContain('{ as: \'operator\', actor: \'member\' }')
  })
})

describe('Upload-Gates', () => {
  it('zählt gegen das Pool-Kontingent — als einziger Layer mit Binärdaten', () => {
    // Heute ein No-Op (der Plan-Katalog kennt keine media-Zeile), wie bei
    // courses/events. Der Haken muss trotzdem stehen: er ist die Stelle, an der
    // beim Pool-Umzug nichts mehr zu suchen ist.
    expect(upload).toContain('assertPoolWriteQuota(event, { kind: \'media\', tableId: MEDIA_TABLE })')
  })

  it('weist zu große Uploads ab, BEVOR der Körper gepuffert wird', () => {
    // readMultipartFormData hält den ganzen Request im Speicher, ehe die echte
    // Größe geprüft werden kann.
    const declaredAt = upload.indexOf('getRequestHeader(event, \'content-length\')')
    const bufferedAt = upload.indexOf('const form = await readMultipartFormData(event)')
    expect(declaredAt).toBeGreaterThan(-1)
    expect(declaredAt).toBeLessThan(bufferedAt)
  })
})

describe('Sichtbarkeit: die zweite Phase bleibt nicht still', () => {
  it('versucht sie erneut und loggt laut, statt den halben Zustand zu verschweigen', () => {
    // Scheitert Phase 2, sagt der Eintrag „Entwurf", während die Datei per
    // Roh-URL weiter abrufbar ist (Muster: Zwei-Phasen-Hide der Kommentare).
    expect(permissions).toContain('.catch(() => run())')
    expect(permissions).toContain('console.error')
  })
})

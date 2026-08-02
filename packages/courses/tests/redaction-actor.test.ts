import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * KURS-VERWALTUNG IST REDAKTION (F17, 2026-08-01).
 *
 * Die sechs Verwaltungs-Routen brauchen den Admin-Client aus einem technischen
 * Grund (courses/lessons tragen bewusst keine User-Schreibrechte — Entwürfe
 * sind server-only, der Inhalt liegt hinter dem Enrollment-Gate). Gehandelt hat
 * dort trotzdem ein Mensch DIESER Community. Vor dieser Durchsicht meldeten
 * sich damit alle sechs still von der Inhalts-Sperre (M13) und vom
 * Beitritts-Auslöser (A5) ab: ein Kurs ließ sich in einer Community mit
 * offener Rechnung anlegen, veröffentlichen und löschen, während ein Kommentar
 * darunter abgewiesen wurde.
 *
 * WARUM AM QUELLTEXT: den Live-Beweis fährt
 * `packages/onboarding/scripts/verify-community-suspension.mjs` (Abschnitt 3)
 * gegen eine echte gesperrte Community. Diese Datei hält die ENTSCHEIDUNG fest
 * — auch für die Routen, die der Live-Beweis nicht einzeln durchgeht.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const routes: Array<[string, string]> = [
  ['Kurs anlegen', read('../server/api/courses/index.post.ts')],
  ['Kurs bearbeiten/veröffentlichen', read('../server/api/courses/[slug]/index.patch.ts')],
  ['Lektion anlegen', read('../server/api/courses/[slug]/lessons.post.ts')],
  ['Lektionen umsortieren', read('../server/api/courses/[slug]/reorder.post.ts')],
  ['Lektion bearbeiten', read('../server/api/lessons/[id].patch.ts')],
  ['Lektion löschen', read('../server/api/lessons/[id].delete.ts')],
]

describe('Kurs-Verwaltung handelt als Redaktion, nicht als Betreiber', () => {
  it.each(routes)('%s: reicht den Handelnden aus dem Gate durch', (_label, source) => {
    // Die Klinke bleibt 'operator', der Handelnde kommt aus
    // `requireCommunityPermission` — NICHT hartkodiert: über die Rolle ist es
    // ein Mitglied, über das Betreiber-Break-Glass der Betreiber.
    expect(source).toContain('{ as: \'operator\', actor }')
    expect(source).toMatch(/const \{[^}]*\bactor\b[^}]*\} = await requireCommunityPermission\(/)
  })

  it.each(routes)('%s: setzt den Handelnden nirgends fest', (_label, source) => {
    expect(source).not.toContain('actor: \'member\'')
    expect(source).not.toContain('actor: \'operator\'')
  })
})

describe('der abgeleitete Zähler bleibt Betreiber-Sache', () => {
  it('syncLessonCount trägt keinen Handelnden — und sagt warum', () => {
    const source = read('../server/utils/courseAccess.ts')
    expect(source).toContain('WER HANDELT (F17)')
    // Der Mensch hat eine Zeile vorher gehandelt; scheitert es dort, ist dieser
    // Nachzug ohnehin nie erreicht. (Geprüft wird die AUFRUFSTELLE, nicht das
    // Wort — die Begründung im Kopf nennt den Parameter natürlich.)
    expect(source).not.toContain('tenantDb(event, { as: \'operator\', actor')
  })
})

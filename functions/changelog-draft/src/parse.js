/**
 * Reine Parsing-Logik für Changelog-Entwürfe — Conventional Commits → gruppierter
 * Entwurfstext + Kategorie. EINE Quelle der Wahrheit, geteilt zwischen:
 *   - Track 2A: packages/admin/scripts/changelog-draft.mjs (lokal, git log)
 *   - Track 2B: functions/changelog-draft/src/main.js (Appwrite Function, GitHub API)
 *
 * Keine Seiteneffekte, keine I/O → unit-testbar (packages/admin/tests).
 */

// Conventional-Commit-Typ → Changelog-Kategorie + Abschnittsüberschrift.
export const TYPE_MAP = {
  feat: { category: 'feature', section: 'Neue Funktionen' },
  fix: { category: 'fix', section: 'Fehlerbehebungen' },
  perf: { category: 'improvement', section: 'Verbesserungen' },
  refactor: { category: 'improvement', section: 'Verbesserungen' },
}

// type(scope)!: description  — scope + breaking-Marker optional.
const CONVENTIONAL = /^(\w+)(?:\([^)]*\))?(!)?:\s*(.+)$/

const SECTION_ORDER = ['Neue Funktionen', 'Verbesserungen', 'Fehlerbehebungen']
const SECTION_TO_CATEGORY = { 'Neue Funktionen': 'feature', Verbesserungen: 'improvement', Fehlerbehebungen: 'fix' }

/**
 * Baut aus Commit-Subjects einen Changelog-Entwurf.
 *
 * @param {string[]} subjects  Commit-Betreffzeilen (erste Zeile je Commit).
 * @param {{ version?: string, range?: string }} [opts]
 * @returns {{ counted: number, body: string, category: string, title: string,
 *            sectionCount: number }}
 *          counted === 0 → nichts Relevantes gefunden (feat/fix/perf/refactor).
 */
export function parseCommitsToDraft(subjects, opts = {}) {
  const { version = '', range = '' } = opts
  const buckets = new Map() // section → [desc, ...]
  let counted = 0

  for (const subject of subjects) {
    const match = String(subject ?? '').match(CONVENTIONAL)
    if (!match) continue
    const [, type, , descRaw] = match
    const mapped = TYPE_MAP[type]
    if (!mapped) continue // chore/docs/test/ci/build/style → raus
    const desc = descRaw.charAt(0).toUpperCase() + descRaw.slice(1)
    if (!buckets.has(mapped.section)) buckets.set(mapped.section, [])
    buckets.get(mapped.section).push(desc)
    counted++
  }

  if (counted === 0) return { counted: 0, body: '', category: '', title: '', sectionCount: 0 }

  const body = SECTION_ORDER
    .filter(section => buckets.has(section))
    .map(section => `${section}:\n${buckets.get(section).map(desc => `• ${desc}`).join('\n')}`)
    .join('\n\n')

  // Dominante Kategorie (meiste Einträge) als Vorauswahl.
  const dominant = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)[0][0]
  const category = SECTION_TO_CATEGORY[dominant]

  const title = version ? `Entwurf ${version}` : `Entwurf ${range || 'HEAD'}`

  return { counted, body, category, title, sectionCount: buckets.size }
}

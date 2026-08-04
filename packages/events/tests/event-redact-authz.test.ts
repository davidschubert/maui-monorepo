import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * F46 — die Schwärzen-Route steht auf denselben drei Beinen wie ihre
 * Geschwister `hide` und `restore`.
 *
 * WARUM ÜBER DEN QUELLTEXT statt über einen Aufruf: die drei Sicherungen sind
 * Nitro-Auto-Imports (`requirePlanProduct`, `requireCommunityPermission`,
 * `tenantDb`) und existieren nur in einer gebauten App. Ein Mock davon prüfte
 * den Mock. Was hier festgehalten wird, ist eine STRUKTUR-Zusage: dieselbe
 * Capability, dieselbe Klinke, dasselbe Produkt-Gate — und zwar nicht als
 * Behauptung im Kommentar, sondern buchstabengetreu neben den beiden Routen,
 * die es schon richtig machen. Weicht eine der drei ab, wird dieser Test rot.
 *
 * NICHT ZU VERWECHSELN mit `redaction-actor.test.ts`: dort meint „Redaktion"
 * die Termin-VERWALTUNG durch Editoren (F17). Hier heißt „redact" SCHWÄRZEN.
 */
const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

const REDACT = read('../server/api/events/[id]/redact.post.ts')
const HIDE = read('../server/api/events/[id]/hide.post.ts')
const RESTORE = read('../server/api/events/[id]/restore.post.ts')

const moderationRoutes: Array<[string, string]> = [
  ['Ausblenden', HIDE],
  ['Wiederherstellen', RESTORE],
  ['Schwärzen', REDACT],
]

describe('Schwärzen verlangt dieselbe Capability wie Ausblenden und Wiederherstellen', () => {
  it.each(moderationRoutes)('%s: events.moderate, mit await', (_label, source) => {
    // Ohne `await` wäre der Gate fail-open — die Route liefe weiter, während
    // die Prüfung noch aussteht.
    expect(source).toContain('await requireCommunityPermission(event, \'events.moderate\')')
  })

  it.each(moderationRoutes)('%s: NICHT events.manage (Editor ≠ Moderator)', (_label, source) => {
    expect(source).not.toContain('\'events.manage\'')
  })

  it.each(moderationRoutes)('%s: Produkt-Gate VOR der Autorisierung', (_label, source) => {
    expect(source).toContain('requirePlanProduct(event, \'events\')')
    // `lastIndexOf`, weil die Kopfkommentare beide Namen ebenfalls nennen —
    // gemeint ist die Reihenfolge im CODE, nicht in der Begründung.
    expect(source.lastIndexOf('requirePlanProduct(event, \'events\')'))
      .toBeLessThan(source.lastIndexOf('await requireCommunityPermission(event, \'events.moderate\')'))
  })
})

describe('Schwärzen benutzt dieselbe Türklinke wie Ausblenden und Wiederherstellen', () => {
  it.each(moderationRoutes)('%s: Datentür als Operator', (_label, source) => {
    expect(source).toContain('tenantDb(event, { as: \'operator\' })')
  })

  it.each(moderationRoutes)('%s: KEIN `actor` — Moderation handelt nicht in eigener Sache', (_label, source) => {
    // C1c: `actor` würde die M13-Inhalts-Sperre auf die Moderation anwenden
    // (eine gesperrte Community wäre nicht mehr moderierbar) und den
    // A5-Beitritt auslösen (der Moderator würde Mitglied, weil er eingreift).
    // Geprüft wird die AUFRUFSTELLE, nicht das Wort — die Kopfkommentare nennen
    // den Parameter naturgemäß (Muster redaction-actor.test.ts).
    expect(source).not.toContain('{ as: \'operator\', actor')
    expect(source).not.toContain('actor: \'member\'')
  })

  it.each(moderationRoutes)('%s: belegt die Zugehörigkeit VOR der Aktion', (_label, source) => {
    // Ohne das `get` durch die Tür läse der Admin-Client fremde Mandanten-Zeilen
    // per Id — genau der Fehler vom 2026-07-26.
    expect(source).toContain('db.get<EventRow>(EVENTS_TABLE, id, \'Event not found\')')
  })
})

describe('Schwärzen hält sich an die pure Regel und an die Datentür', () => {
  it('fragt `canRedactEvent` und wirft sonst 409 mit dem Grund im Umschlag', () => {
    expect(REDACT).toContain('canRedactEvent(row.status)')
    expect(REDACT).toContain('status: 409')
    // `data: { code }` ist der EINE Schlüssel, den core/server/error.ts als
    // `reason` ins Envelope hebt — ohne ihn käme der Grund nie beim Client an.
    expect(REDACT).toContain('data: { code: verdict.reason }')
  })

  it('leert JEDEN vom Autor gewählten Text und setzt den Marker in EINEM Schreibvorgang', () => {
    // Die Liste ist der eigentliche Vertrag. Der erste Schnitt leerte nur Titel
    // und Beschreibung — die übrigen fünf Felder stehen auf DERSELBEN Seite,
    // und ein Link auf eine anstößige Seite ist derselbe Fall wie ein
    // anstößiger Titel. Wer hier eines wegnimmt, macht das Werkzeug durch die
    // Wahl des Feldes umgehbar; deshalb steht die Liste hier und nicht nur im
    // Kommentar.
    for (const feld of ['title', 'description', 'location', 'address', 'locationNotes', 'url', 'replayUrl']) {
      expect(REDACT).toMatch(new RegExp(`\\n\\s*${feld}: (''|null),`))
    }
    expect(REDACT).toContain('redactedAt: new Date().toISOString()')
    // Gegenprobe: der Name des Organisators ist Identität, nicht Inhalt — ihn
    // zu leeren nähme die Zurechenbarkeit.
    expect(REDACT).not.toMatch(/\n\s*organizerName: /)
  })

  it('LÖSCHT das Titelbild, statt es umzupermissionieren', () => {
    // Der Unterschied zum Ausblenden: die Row bleibt absichtlich lesbar, also
    // bliebe es auch die Datei. `applyEventCoverVisibility` wäre hier folgenlos
    // — wer es „der Einheitlichkeit halber" einsetzt, lässt das Bild stehen.
    expect(REDACT).toContain('deleteFile({ bucketId: EVENT_COVERS_BUCKET')
    // Die AUFRUFSTELLE, nicht das Wort — der Kopfkommentar erklärt naturgemäß,
    // warum diese Funktion hier gerade NICHT benutzt wird.
    expect(REDACT).not.toContain('await applyEventCoverVisibility(')
    expect(HIDE).toContain('await applyEventCoverVisibility(')
  })

  it('schließt die offenen Meldungen — mit dem passenden Wort', () => {
    // 'redacted', nicht 'hidden': der Termin ist NICHT ausgeblendet.
    expect(REDACT).toContain('resolveReportsForTarget(event, \'event\', id, \'redacted\'')
    expect(HIDE).toContain('resolveReportsForTarget(event, \'event\', id, \'hidden\'')
  })

  it('räumt den Activity-Feed, der einen eigenen Titel-Schnappschuss hält', () => {
    // Ohne diesen Schritt stünde der geschwärzte Titel im Feed weiter da.
    expect(REDACT).toContain('removeActivitiesForObject(event, { objectType: \'event\', objectId: id })')
  })

  it('nimmt den zweiten Aufruf idempotent an, statt ihn abzulehnen', () => {
    expect(REDACT).toContain('if (eventIsRedacted(row.redactedAt))')
  })
})

describe('Die Begründungen stehen an der Stelle, nicht nur im Protokoll', () => {
  it('erklärt, warum es KEINEN Audit-Eintrag gibt', () => {
    // Der Originaltext ist danach weg — wer das später „nachbessert", soll
    // zuerst lesen, warum es eine bewusste Entscheidung war (A14-Layergrenze,
    // Marker auf der Zeile, WER gehört nicht auf eine öffentliche Row).
    expect(REDACT).toContain('KEIN AUDIT-EINTRAG')
    expect(REDACT).toContain('recordAudit')
  })

  it('erklärt, warum das Titelbild gelöscht und nicht umpermissioniert wird', () => {
    expect(REDACT).toContain('DAS TITELBILD WIRD GELÖSCHT, NICHT UMPERMISSIONIERT')
  })

  it('benennt die verworfene Alternative', () => {
    expect(REDACT).toMatch(/VERWORFEN/)
  })
})

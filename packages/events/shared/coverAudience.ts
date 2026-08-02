/**
 * DIE REGEL FÜR TITELBILDER, in einem Satz: **eine Datei ist nie offener als
 * ihre Zeile.**
 *
 * PURE und ohne jeden Import — damit sie an allen drei Stellen dieselbe sein
 * kann, die sie brauchen: die Laufzeit (server/utils/eventCovers.ts), die
 * Migration (scripts/migrations/010-cover-drafts-closed.ts, ein eigenständiges
 * Node-Skript ohne Nitro-Auto-Imports) und der Live-Beweis
 * (packages/control/scripts/verify-audience-flip.mjs, der sie per
 * --experimental-strip-types direkt hier importiert). Vorher stand sie zweimal
 * ausgeschrieben da, und zwei Kopien einer Sichtbarkeitsregel laufen
 * auseinander, ohne dass es jemand merkt.
 *
 * DIE READ-EINTRÄGE DER ROW SIND DIE WAHRHEIT — nicht `status`. Ein abgesagter
 * Termin behält sein Publikum (die Zusagenden müssen die Absage sehen), und
 * C18 kann das Publikum jederzeit umgezogen haben, ohne dass sich der Status
 * geändert hätte. Vier Zustände, EINE Rechnung:
 *   Entwurf        → Row trägt kein Leserecht  → Datei auch nicht
 *   veröffentlicht → read(any) bzw. read(label:<communityId>) → dasselbe
 *   zurückgezogen  → Leserecht ist wieder weg  → Datei auch
 *   abgesagt       → Leserecht bleibt          → Datei bleibt abrufbar
 *
 * WARUM ENTWÜRFE JETZT GANZ ZU SIND (F28, 2026-08-02): bis hierher fiel ein
 * Cover ohne Row-Leserecht auf das MITGLIEDER-Publikum der Community zurück —
 * jedes Mitglied konnte das Titelbild eines unveröffentlichten Termins per
 * Roh-URL abrufen. Der Grund dafür war die Vorschau im Dashboard, die der
 * BROWSER direkt aus dem Bucket holte. Den Weg gibt es jetzt
 * (`GET /api/events/:id/cover`, hinter `events.manage` und der Datentür),
 * also fällt die Ausnahme weg. Ein leeres Array heißt: außer dem Admin-Client
 * liest diese Datei niemand.
 */
export function coverReadPermissions(rowPermissions: readonly string[] | null | undefined): string[] {
  return (rowPermissions ?? []).filter(permission => permission.startsWith('read('))
}

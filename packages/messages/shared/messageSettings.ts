/**
 * DER OWNER-SCHALTER (Konzept § 2.6, Davids Entscheidung 4: Default AUS).
 *
 * ── WARUM ES DAFÜR ÜBERHAUPT EINE TABELLE BRAUCHT ─────────────────────────
 * Gemessen am Bestand: es gibt im Laufzeit-Projekt KEINE Tabelle für
 * Einstellungen JE COMMUNITY. `app_config` ist EINE Zeile pro Projekt
 * (system-Layer), `communities.*` liegt im Control Plane und ist vom
 * Runtime-Projekt aus nicht schreibbar. Der Schalter braucht deshalb eine
 * eigene, sehr kleine Zeile in diesem Layer.
 *
 * ── RÜCKFALL ZUR LAUFZEIT STATT BACKFILL ──────────────────────────────────
 * Dasselbe Muster und dieselbe Begründung wie
 * `packages/pages/shared/guidelinesFallback.ts`: eine Migration kann die
 * Communities gar nicht aufzählen (die Liste steht im Control Plane, der
 * Migrationslauf bekommt einen Schlüssel für EIN Projekt), und sie schriebe
 * ungefragt in fremde Daten. Fehlt die Zeile, gilt der Vorgabewert; das erste
 * Speichern legt sie an. Wer sie löscht, bekommt wieder den Vorgabewert — kein
 * halber Zustand.
 *
 * ── DEFAULT AUS, UND ZWAR MIT GRUND ───────────────────────────────────────
 * Davids Entscheidung 4 wörtlich: der Owner öffnet den privaten Kanal BEWUSST.
 * Das ist zugleich die Projektregel „Core-Default ist IMMER aus" — die eine
 * dokumentierte Ausnahme (`realtime`) war bestehendes Verhalten, hier ist
 * nichts bestehend. Der Preis steht im Konzept und wird bezahlt: Communities
 * entdecken das Produkt nicht von selbst, es braucht den sichtbaren Hinweis im
 * Dashboard.
 */

/** Ohne Zeile, ohne Wert, mit kaputtem Wert: AUS. */
export const MESSAGES_ENABLED_DEFAULT = false

/**
 * Der wirkende Schalter aus einer (womöglich fehlenden) Zeile.
 *
 * FAIL-CLOSED: alles, was nicht ausdrücklich `true` ist, heißt aus. Ein
 * geratenes „an" wäre ein privater Kanal, dem niemand zugestimmt hat.
 */
export function messagesEnabledFrom(row: { enabled?: unknown } | null | undefined): boolean {
  if (!row) return MESSAGES_ENABLED_DEFAULT
  return row.enabled === true
}

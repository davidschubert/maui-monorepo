import type { Capability } from './types/authz'

/**
 * VERTRAUENSSTUFEN — die zweite Hälfte der Community-Rechte-Matrix
 * (F1 Teilpaket 3, Davids Architektur-Entscheidung vom 2026-08-04).
 *
 * ── EIN RECHTESYSTEM, ZWEI QUELLEN ────────────────────────────────────────
 * Davids Entscheidung ist wörtlich: „TL speisen das BESTEHENDE RBAC — die
 * Stufe wird aus den Zählern berechnet, und der vorhandene Capability-Resolver
 * vergibt daraus zusätzliche Capabilities. EIN Rechtesystem,
 * `requireCommunityPermission` bleibt die einzige Tür; ein paralleles
 * TL-Prüfsystem ist ABGELEHNT."
 *
 * Deshalb steht hier KEINE Prüffunktion, sondern nur eine zweite Zuordnung
 * derselben Bauart wie `COMMUNITY_ROLE_CAPABILITIES` in `communityAuthz.ts`:
 * Rolle → Capabilities dort, Stufe → Capabilities hier. Zusammengeführt werden
 * beide an genau EINER Stelle (`decideCommunityAccess`), und die Tür bleibt
 * dieselbe. Wer eine neue Stufen-Fähigkeit braucht, trägt sie hier ein — nicht
 * in eine `if (trustLevel >= 3)`-Zeile in einer Route.
 *
 * ── WAS EINE STUFE IST UND WAS NICHT ──────────────────────────────────────
 * Die Stufe ist eine Aussage über VERHALTEN in EINER Community (dabei seit,
 * geschrieben, zugestimmt, Zustimmung bekommen) — kein Amt. Sie ERWEITERT die
 * Rolle nach unten und nimmt ihr nie etwas: `decideCommunityAccess` fragt die
 * Rolle ZUERST, und diese Zuordnung ist eine reine Zusatzquelle. Ein Owner
 * verliert also nichts, wenn er Stufe 0 hat, und ein Gast gewinnt nichts, wenn
 * die Zähler fehlen (fail-soft ⇒ Stufe 0).
 *
 * ── WARUM CORE UND NICHT DER posts-LAYER ──────────────────────────────────
 * Die SCHWELLEN (wie viele Tage, wie viele Inhalte) sind Produkt-Regeln und
 * leben in `packages/posts/shared/trustLevels.ts` — sie hängen an
 * `member_counters`, einer Tabelle, die core nach A14 nicht kennen darf. Die
 * CAPABILITIES dagegen sind RBAC und gehören zur Matrix; sie neben die
 * Rollen-Matrix zu legen ist der einzige Weg, „wer darf was" an einer Stelle
 * lesbar zu halten. Core kennt also die Stufe als ZAHL und was sie verleiht,
 * nicht wie man sie verdient.
 */

/** Die fünf Stufen. 0 = keine, 4 = „Leader" (nur von Hand ernannt). */
export const TRUST_LEVELS = [0, 1, 2, 3, 4] as const
export type TrustLevel = (typeof TRUST_LEVELS)[number]

/** Die höchste Stufe, die man sich selbst erarbeiten kann (Davids Zuschnitt). */
export const TRUST_LEVEL_EARNABLE_MAX = 3

/** Die von Hand ernannte Stufe — es gibt genau eine. */
export const TRUST_LEVEL_LEADER = 4

/**
 * Stufe → die Capabilities, die SIE zusätzlich verleiht (kumulativ notiert,
 * damit man eine Zeile lesen kann, ohne die darüber im Kopf zu haben).
 *
 * ── DAVIDS v1-ZUSCHNITT (DECISION-LOG 2026-08-04) ─────────────────────────
 * „TL3 darf fremde Themen umbenennen und umkategorisieren; TL4 bekommt
 * anheften/schließen/gelöst + fremde Beiträge bearbeiten; TL1/TL2 sind v1
 * sichtbarer Status + Abzeichen."
 *
 * Stufe 1 und 2 waren bis zum 2026-08-05 LEER, und das war der Punkt und keine
 * Lücke: ihre Katalog-Rechte (private Nachrichten, Einladungen durch
 * Mitglieder, mehr Tages-Likes) hingen an Funktionen, die es hier noch gar
 * nicht gab. Der Satz von damals lautete „Kommen die Funktionen, kommen ihre
 * Zeilen hierher" — genau das ist mit den privaten Nachrichten passiert.
 *
 * `messages.write` bei STUFE 1 ist Davids Katalog-Zuordnung („Basic: private
 * Nachrichten, Melden, Wiki, mehrere Bilder/Links je Beitrag"). Sie steht hier
 * und NICHT als `if (trustLevel >= 1)`-Zeile in einer Route — das ist Davids
 * Architektur-Entscheidung vom 2026-08-04: EIN Rechtesystem,
 * `requireCommunityPermission` bleibt die einzige Tür.
 *
 * SIE DARF NIE NACH STUFE 0 WANDERN. Daran hängt die A5-Zusage aus dem
 * PN-Konzept § 3: eine private Nachricht löst über die Datentür den
 * Beitritts-Auslöser aus, und der ist nur deshalb strukturell folgenlos, weil
 * senden darf, wer längst Mitglied ist. Der Test dazu steht in
 * `packages/messages/tests/trustGate.test.ts`.
 *
 * Stufe 2 bleibt vorerst leer: ihre Katalog-Rechte sind Gruppen-Nachrichten
 * (PN-Konzept § 7, Stufe 3), Mitglieder-Einladungen und das Tages-Like-Limit —
 * keine davon ist heute gebaut. Dieselbe Regel wie oben gilt weiter: keine
 * erfundene Ersatz-Capability.
 */
export const TRUST_LEVEL_CAPABILITIES: Record<TrustLevel, readonly Capability[]> = {
  0: [],
  1: ['messages.write'],
  2: ['messages.write'],
  3: ['messages.write', 'posts.curate'],
  4: ['messages.write', 'posts.curate', 'posts.arrange', 'posts.revise'],
}

/** Type-Guard: ist die Zahl eine bekannte Stufe? */
export function isTrustLevel(value: unknown): value is TrustLevel {
  return typeof value === 'number' && (TRUST_LEVELS as readonly number[]).includes(value)
}

/**
 * Eine gelesene Zahl auf eine gültige Stufe bringen.
 *
 * FAIL-SOFT NACH UNTEN: alles Unbrauchbare (fehlend, kaputt, negativ) wird 0,
 * alles Übergroße wird auf 4 gekappt statt verworfen. Eine kaputte Zahl darf
 * nie mehr Rechte ergeben als eine gültige — und eine Zeile, die aus welchem
 * Grund auch immer eine 7 trägt, soll nicht als Stufe 0 durchgehen und dem
 * Menschen still seine Rechte nehmen.
 */
export function normalizeTrustLevel(value: unknown): TrustLevel {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const whole = Math.floor(value)
  if (whole <= 0) return 0
  return (whole >= TRUST_LEVEL_LEADER ? TRUST_LEVEL_LEADER : whole) as TrustLevel
}

/** Verleiht GENAU DIESE Stufe die gefragte Capability? */
export function trustLevelHasCapability(level: TrustLevel, capability: Capability): boolean {
  return TRUST_LEVEL_CAPABILITIES[level].includes(capability)
}

/** Die Capabilities einer Stufe als Set (für UI/Aggregation). */
export function trustLevelCapabilitiesFor(level: unknown): Set<Capability> {
  return new Set(TRUST_LEVEL_CAPABILITIES[normalizeTrustLevel(level)])
}

/**
 * Kann IRGENDEINE Stufe diese Capability verleihen?
 *
 * DIE FRAGE, DIE DEN PREIS SPART: `requireCommunityPermission` müsste sonst vor
 * JEDER Prüfung die Stufe nachschlagen — eine Datenbank-Abfrage an jeder
 * geschützten Route, für 27 Capabilities, von denen drei überhaupt betroffen
 * sind. Mit dieser Frage kostet die Erweiterung an allen übrigen Routen exakt
 * nichts, und die Antwort ist rein statisch.
 */
export function trustLevelGrantsCapability(capability: Capability): boolean {
  for (const level of TRUST_LEVELS) {
    if (TRUST_LEVEL_CAPABILITIES[level].includes(capability)) return true
  }
  return false
}

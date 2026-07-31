/**
 * Ablage-Ebene der Benachrichtigungen (C15 / Audit S6) — PURE, unit-getestet.
 *
 * Hier, im shared-Bereich, weil DREI Seiten dieselbe Wahrheit brauchen: notify()
 * schreibt den Wert, die Leseroute filtert damit, und die Glocke muss ihren
 * Realtime-Strom nach derselben Regel aussortieren. Drei Kopien dieser Rechnung
 * wären ein sicherer Weg in eine Glocke, die live etwas einblendet, das der
 * nächste Reload wieder wegnimmt.
 *
 * WOFÜR SIE NICHT DA IST: Zugriffsschutz. Wer eine Notification lesen darf,
 * entscheiden ihre Row-Permissions (read/update nur für `recipientId`) — daran
 * ändert diese Datei nichts und soll sie nichts ändern. Es geht ausschließlich
 * darum, WO eine Meldung erscheint: wer in zwei Communities Mitglied ist, sah
 * auf beiden Hosts eine gemischte Glocke (Titel und Links aus der anderen
 * Community, teils auf Pfade, die es hier gar nicht gibt).
 */

/**
 * Der Spaltenwert für „gehört dem Kundenbereich, nicht einer Community".
 *
 * KOLLISIONSFREI per Appwrite-Regel: eine Row-Id (und damit jede echte
 * `tenantId`) darf nicht mit einem Sonderzeichen beginnen — `_account` kann
 * also nie eine reale Mandanten-Id sein. Deshalb ein Sentinel in DERSELBEN
 * Spalte statt einer zweiten Spalte: ein Filter, ein Index, ein Wert.
 */
export const NOTIFICATION_SCOPE_ACCOUNT = '_account'

/** Der Spaltenwert „unbekannt" — Bestandszeilen und Silo-Normalfall. */
export const NOTIFICATION_SCOPE_UNKNOWN = ''

/**
 * Wohin gehört diese Meldung? EXPLIZIT am notify()-Vertrag (Davids
 * Entscheidung 3, 2026-07-29) — kein Default, kein geratener Stempel:
 *  - 'tenant'  → in die Community, in der der auslösende Vorgang passiert ist
 *    (Antwort, Erwähnung, Termin-Erinnerung, Ticket-Update).
 *  - 'account' → in den Kundenbereich. Für alles, was den VERTRAG betrifft und
 *    keine Community-Zugehörigkeit hat: Zahlung fehlgeschlagen (Stripe-Webhook),
 *    Early-Access-Anfrage (Control Plane). Ein Mitglied einer Kunden-Community
 *    darf so etwas nicht in seiner Community-Glocke sehen.
 */
export type NotifyScope = 'tenant' | 'account'

/**
 * Die drei Welten, in denen eine Glocke hängen kann. Absichtlich eine eigene
 * Aufzählung und nicht `TenantContext`: der Kundenbereich HAT keinen Mandanten,
 * ist aber auch kein Silo — genau diese Unterscheidung fehlt dem Tenant-Kontext
 * (dort ist beides `null`).
 */
export type NotificationAudience =
  /** Community-Host im Pool. */
  | { kind: 'tenant', tenantId: string }
  /** Kontroll-Host = Kundenbereich (my.pukalani.app). */
  | { kind: 'account' }
  /** Silo-App / Single-Tenant / Playground: es gibt nur eine Welt. */
  | { kind: 'all' }

/**
 * Publikum aus den zwei Signalen, die Server UND Client haben: die Mandanten-Id
 * dieses Hosts (null außerhalb des Pools) und ob der Host ein Kontroll-Host ist.
 */
export function notificationAudienceFor(tenantId: string | null, accountArea: boolean): NotificationAudience {
  if (tenantId) return { kind: 'tenant', tenantId }
  return accountArea ? { kind: 'account' } : { kind: 'all' }
}

/**
 * Der Spaltenwert beim SCHREIBEN. `tenantId` ist die Mandanten-Id des Requests
 * (null = kein Pool-Mandant).
 *
 * Im Silo läuft 'tenant' auf `''` — dort gibt es keine Mandanten, und ein
 * erfundener Wert wäre eine Behauptung über eine Zugehörigkeit, die es nicht
 * gibt (dieselbe Begründung wie system-021).
 */
export function notificationScopeValue(scope: NotifyScope, tenantId: string | null): string {
  if (scope === 'account') return NOTIFICATION_SCOPE_ACCOUNT
  return tenantId ?? NOTIFICATION_SCOPE_UNKNOWN
}

/**
 * Welche Spaltenwerte darf diese Glocke zeigen? `null` = alle (Silo — dort gibt
 * es nichts zu trennen, Verhalten unverändert).
 *
 * FAIL-OPEN für `''` (Davids Entscheidung 2, 2026-07-29) — die begründete
 * AUSNAHME von der sonst geltenden fail-closed-Regel (`rowBelongsToTenant`
 * wertet eine Zeile ohne Stempel im Pool als fremd). Grund: es gibt keinen
 * Backfill, weil sich eine Bestandszeile nur über ihr Zielobjekt zuordnen
 * ließe. Fail-closed würde jedem Nutzer im Moment des Deploys die Glocke
 * leeren — und zwar dauerhaft, nicht bis zur nächsten Migration. Weil
 * Row-Security ohnehin nur den Empfänger heranlässt, kostet Fail-open hier
 * keine Isolation, sondern nur Ordnung: Altzeilen erscheinen in jeder Glocke
 * des Empfängers und laufen mit der Zeit aus. NICHT auf fail-closed
 * „korrigieren".
 */
export function visibleNotificationScopes(audience: NotificationAudience): string[] | null {
  if (audience.kind === 'all') return null
  if (audience.kind === 'account') return [NOTIFICATION_SCOPE_ACCOUNT, NOTIFICATION_SCOPE_UNKNOWN]
  return [audience.tenantId, NOTIFICATION_SCOPE_UNKNOWN]
}

/**
 * Gehört diese EINE Zeile in diese Glocke? Der Realtime-`where`-Filter der
 * Glocke — dieselbe Rechnung wie der Query-Filter der Leseroute, damit live
 * nichts erscheint, das der nächste Reload wieder entfernt.
 *
 * Bewusst NICHT `rowBelongsToHost()` (core/app/composables/useTenantId.ts):
 * das ist in beide Richtungen fail-closed und damit für Notifications falsch —
 * es würde Bestandszeilen ausblenden und den `_account`-Sentinel nicht kennen.
 */
export function notificationVisibleFor(
  audience: NotificationAudience,
  row: { communityId?: string | null },
): boolean {
  const allowed = visibleNotificationScopes(audience)
  if (!allowed) return true
  return allowed.includes(row.communityId ?? NOTIFICATION_SCOPE_UNKNOWN)
}

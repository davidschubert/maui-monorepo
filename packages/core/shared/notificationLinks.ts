/**
 * WOHIN ZEIGT DER LINK IN EINER BENACHRICHTIGUNGS-MAIL? (D5) — PURE, unit-getestet.
 *
 * Die Glocke in der App war seit C15 richtig, die MAIL nicht: `absoluteLink()`
 * baute jede URL aus EINER Env-Basis (`public.appUrl`). Eine Antwort in
 * „Morgenlicht" verlinkte damit auf den App-Host — dort gibt es den Pfad
 * entweder nicht, oder er zeigt auf die Inhalte einer ANDEREN Community. Die
 * Session-Cookies sind ohnehin host-gebunden, der Empfänger landete also im
 * besten Fall abgemeldet an der falschen Stelle.
 *
 * Die Regel steht hier in `shared/`, weil die Ablage-Ebene daneben es auch tut
 * (notificationScope.ts) und weil sie ZWEI Konsumenten hat, die sich sonst
 * auseinanderentwickeln: die Sofort-Mail (mit Request) und der Digest-Sweep
 * (ohne Request, mehrere Communities in EINER Mail).
 *
 * DREI FÄLLE, genau die drei Spaltenwerte aus notificationScope.ts:
 *  - `<communityId>` → der Host DIESER Community (aufgelöst über den
 *    Registry-Vertrag `registerCommunityHostResolver`, Implementierung im
 *    control-Layer — core darf das Control Plane nicht kennen, A14).
 *  - `_account`      → der Host der App, in der die Zeile entstanden ist. Das
 *    ist per Konstruktion `public.appUrl` DIESES Deployments: geschrieben,
 *    zugestellt und gelesen wird sie im selben Projekt (C17).
 *  - `''` (unbekannt) → ebenfalls `public.appUrl`. Bestandszeilen und der
 *    Silo-Normalfall; das ist das heutige Verhalten und dort auch richtig.
 *
 * FAIL-SOFT ist Pflicht, nicht Bequemlichkeit: fällt die Auflösung aus (Control
 * Plane nicht erreichbar, Community gelöscht/abgeschaltet, kein Resolver
 * registriert), fällt der Link auf `public.appUrl` zurück — die Mail geht
 * trotzdem raus. Eine verworfene Benachrichtigung wäre der größere Schaden als
 * ein Link, der so gut ist wie der von gestern.
 */
import { NOTIFICATION_SCOPE_ACCOUNT } from './notificationScope'

/**
 * Host → Origin. Dieselbe Schema-Regel wie in der Community-Einladungsmail
 * (`sendCommunityInviteMail`, control): lokale Hosts sprechen http, alles
 * andere https.
 *
 * Der Port fehlt bewusst — die `communities`-Tabelle speichert den KANONISCHEN
 * Host ohne Port, und in Produktion hat er keinen. Lokal heißt das, dass der
 * Link auf `http://kunde-a.localhost` ohne `:3006` zeigt; das ist eine
 * Eigenheit der Entwicklungsumgebung und kein Fehler der Regel (die
 * Einladungsmail verhält sich seit control-019 genauso).
 */
export function communityOrigin(host: string): string {
  const clean = host.trim().toLowerCase()
  if (!clean) return ''
  const local = clean === 'localhost' || clean.startsWith('localhost:') || clean.endsWith('.localhost')
  return `${local ? 'http' : 'https'}://${clean}`
}

/**
 * Interner Ziel-Pfad absichern (Open-Redirect-Guard). Wortgleich zu dem, was
 * `absoluteLink()` bisher tat, nur eigenständig testbar: nur ein einzelner
 * führender Schrägstrich, kein `//`, kein `\`, kein `%`-Präfix und kein
 * Leerraum — sonst `/`.
 *
 * WARUM DAS HIER WICHTIGER IST ALS VORHER: der Pfad wird jetzt an einen HOST
 * geklebt, der aus der Datenbank kommt. Ein `//evil.example` würde ohne diese
 * Prüfung zu `https://kunde-a.pukalani.app//evil.example` — der Guard ist die
 * Stelle, an der aus einem Ziel-Pfad nie ein fremder Host werden kann.
 */
export function safeNotificationPath(link: string): string {
  return /^\/(?![/\\%])[^\s\\]*$/.test(link) ? link : '/'
}

/**
 * Was der Mail-Bauer über die Links dieser einen Mail wissen muss.
 *
 * `hosts` ist eine bereits AUFGELÖSTE Karte (Ablage-Wert → kanonischer Host).
 * Bewusst eine fertige Karte und keine Nachschlage-Funktion: der Digest-Sweep
 * löst einmal für alle Empfänger auf, und ein Mail-Bauer, der selbst nachladen
 * könnte, wäre die Einladung zur N+1-Abfrage über Projektgrenzen.
 */
export interface NotificationLinkContext {
  /** Absolute Basis dieser App (`public.appUrl`), ohne Schrägstrich am Ende. */
  appBase: string
  /** Ablage-Wert (`notifications.communityId`) → kanonischer Host. */
  hosts?: Readonly<Record<string, string>>
}

/**
 * Die Basis für EINEN Eintrag. `communityId` ist der Spaltenwert der Zeile —
 * nicht der Mandant des Requests: in einer Digest-Mail hat JEDER Eintrag seinen
 * eigenen (Davids C15-Regel „eine Sammel-Mail pro Tag, nicht eine je
 * Community" macht die gemischte Mail zum Normalfall).
 */
export function notificationLinkBase(
  context: NotificationLinkContext,
  communityId: string | null | undefined,
): string {
  const base = context.appBase.replace(/\/+$/, '')
  if (!communityId || communityId === NOTIFICATION_SCOPE_ACCOUNT) return base
  const host = context.hosts?.[communityId]
  if (!host) return base
  return communityOrigin(host) || base
}

/** Absolute URL eines Eintrags — Basis nach der Regel oben + geprüfter Pfad. */
export function notificationLinkUrl(
  context: NotificationLinkContext,
  item: { link: string, communityId?: string | null },
): string {
  return `${notificationLinkBase(context, item.communityId)}${safeNotificationPath(item.link)}`
}

/**
 * Welche Ablage-Werte müssen für diese Einträge überhaupt aufgelöst werden?
 * PURE Vorstufe zum Resolver-Aufruf: `_account`, `''` und Dubletten fallen
 * raus — der Sweep fragt sonst für jede Bestandszeile das Control Plane.
 */
export function communityIdsNeedingHost(
  items: ReadonlyArray<{ communityId?: string | null }>,
): string[] {
  const ids = new Set<string>()
  for (const item of items) {
    const id = item.communityId
    if (id && id !== NOTIFICATION_SCOPE_ACCOUNT) ids.add(id)
  }
  return [...ids]
}

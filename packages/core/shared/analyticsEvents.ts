/**
 * DIE VORDEFINIERTEN EREIGNISSE DER PLATTFORM (F47, 2026-08-07) — was eine
 * Community außer Seitenaufrufen zählt: Beitritte, Kommentare, Beiträge,
 * Zu-/Absagen, Einschreibungen.
 *
 * WARUM EIN VOKABULAR STATT FREIER STRINGS: die Namen landen als Custom Events
 * in Plausible und kommen über die Stats-Abfrage (`event:name`) zurück ins
 * Dashboard. Ein Tippfehler an einer Sende-Stelle wäre dort keine Fehlermeldung,
 * sondern eine stumm fehlende Zeile. Gesendet wird deshalb über den SCHLÜSSEL
 * (`trackAnalyticsEvent('commentCreated')`, core/app/utils) — den Namen kennt
 * nur diese Datei, und die Stats-Abfrage filtert auf GENAU diese Liste (die
 * eingebauten `pageview`/`engagement`-Events und fremde Custom Events einer
 * eigenen Site bleiben draußen).
 *
 * NAMEN SIND DATEN, KEINE UI: englisch und stabil, weil sie so in Plausible
 * gespeichert werden — umbenennen hieße, die Historie zu verlieren. Die
 * ANZEIGE übersetzt der analytics-Layer über die Schlüssel (i18n
 * `analytics.admin.event.<key>`).
 */
export const ANALYTICS_EVENTS = {
  memberJoined: 'Member Joined',
  commentCreated: 'Comment Created',
  postCreated: 'Post Created',
  eventRsvp: 'Event RSVP',
  courseEnrolled: 'Course Enrolled',
} as const

export type AnalyticsEventKey = keyof typeof ANALYTICS_EVENTS
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[AnalyticsEventKey]

/** Die Namen als Liste — der `event:name`-Filter der Stats-Abfrage. */
export const ANALYTICS_EVENT_NAMES: string[] = Object.values(ANALYTICS_EVENTS)

/**
 * PURE: Name → Schlüssel (für die Anzeige-Übersetzung). `undefined` für
 * Namen außerhalb des Vokabulars — der Aufrufer zeigt dann den Rohnamen.
 */
export function analyticsEventKey(name: string): AnalyticsEventKey | undefined {
  return (Object.keys(ANALYTICS_EVENTS) as AnalyticsEventKey[])
    .find(key => ANALYTICS_EVENTS[key] === name)
}

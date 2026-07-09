/**
 * Zeitfenster der People-Filter (Nav-Badges + Listen-Filter nutzen dieselben
 * Definitionen): „Aktiv" = zuletzt gesehen innerhalb 48 Stunden (Entscheidung
 * 2026-07-08 — 24 h wäre für eine kleine Community zu streng, 30 Tage sagten
 * nichts aus) · „Neu" = registriert innerhalb 7 Tagen (48 h wäre meist leer).
 */
export const USERS_ACTIVE_WINDOW_MS = 48 * 3600_000
export const USERS_NEW_WINDOW_MS = 7 * 24 * 3600_000

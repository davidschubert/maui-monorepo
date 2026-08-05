import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { MESSAGES_ENABLED_DEFAULT, messagesEnabledFrom } from '../../shared/messageSettings'
import { MESSAGE_SETTINGS_TABLE, type MessageSettings } from '../../shared/types/message'

/**
 * DER OWNER-SCHALTER — die eine Frage an die Datenbank (Konzept § 2.6).
 *
 * Die REGEL ist pur und steht in `shared/messageSettings.ts`; hier steht nur
 * das Nachschlagen. Dieselbe Aufteilung wie bei `guidelinesFallback.ts` /
 * `guidelinesPresence.ts` — so bleibt der Vorgabewert ohne Nitro testbar.
 *
 * ── DIE KLINKE IST 'operator', DER HANDELNDE IST ES NICHT ────────────────
 * Die Tabelle trägt bewusst keine Row-Permissions (Migration messages-001):
 * ein Schalter, den jedes Mitglied lesen kann, wäre eine Realtime-Quelle ohne
 * Zweck. Gelesen wird deshalb mit dem Admin-Client. Der HANDELNDE ist dabei
 * `'operator'`, und das ist keine Nachlässigkeit: eine Einstellung
 * nachzuschlagen ist weder Inhalt (M13) noch ein Beitritt (A5). Wer schreibt,
 * setzt `actor` selbst — siehe `saveMessagesEnabled`.
 *
 * ── GECACHT, WEIL JEDE ROUTE FRAGT ───────────────────────────────────────
 * Der Schalter wird vor JEDEM Senden, Lesen und Öffnen gefragt. 30 Sekunden
 * ist dieselbe Größenordnung wie beim Mandanten-Resolver; das Speichern räumt
 * den Eintrag sofort, die Wartezeit betrifft also nur den Fall, in dem sich
 * nichts geändert hat.
 */
const CACHE_TTL_MS = 30_000
const cache = createMicrocache<boolean>(CACHE_TTL_MS)

function settingsDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/** Die (womöglich fehlende) Zeile dieser Community. */
export async function findMessageSettings(event: H3Event): Promise<MessageSettings | null> {
  return settingsDb(event).find<MessageSettings>(MESSAGE_SETTINGS_TABLE, [Query.limit(1)])
}

/**
 * Sind private Nachrichten in DIESER Community eingeschaltet?
 *
 * FAIL-CLOSED bei jedem Fehler: ein nicht lesbarer Schalter heißt „aus". Die
 * Gegenrichtung wäre ein privater Kanal, der aufgeht, weil eine Abfrage
 * scheitert — genau das Gegenteil von Davids Entscheidung 4.
 */
export async function messagesEnabled(event: H3Event): Promise<boolean> {
  const key = tenantCacheScope(event)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  try {
    const value = messagesEnabledFrom(await findMessageSettings(event))
    cache.set(key, value)
    return value
  }
  catch {
    return MESSAGES_ENABLED_DEFAULT
  }
}

/** Nach dem Speichern (und in Tests): den gemerkten Stand verwerfen. */
export function forgetMessageSettings(event: H3Event): void {
  cache.delete(tenantCacheScope(event))
}

/**
 * Den Schalter setzen. Legt die Zeile beim ERSTEN Speichern an — das ist die
 * andere Hälfte des Laufzeit-Rückfalls: solange niemand etwas entschieden hat,
 * steht hier nichts in fremden Daten.
 *
 * `actor` kommt vom Aufrufer (aus `requireCommunityPermission`), weil hier
 * ein MENSCH handelt. Die Klinke bleibt `'operator'` — die Tabelle trägt keine
 * User-Schreibrechte. Und weil der Schalter eine OWNER-EINSTELLUNG ist,
 * reicht die Route ihn mit `actor: 'operator'` durch: M13 friert Inhalte ein,
 * nicht die Einstellungen des Owners (CLAUDE.md, Davids Grenze).
 */
export async function saveMessagesEnabled(event: H3Event, enabled: boolean): Promise<boolean> {
  const db = settingsDb(event)
  const existing = await findMessageSettings(event)

  if (existing) {
    await db.update(MESSAGE_SETTINGS_TABLE, existing.$id, { enabled }, 'Settings not found')
  }
  else {
    // `permissions: []` AUSDRÜCKLICH: die Vorgabe der Datentür wäre
    // `read('members')`, und damit könnte jedes Mitglied den Schalter der
    // Community per Realtime beobachten. Er wird ausschließlich server-seitig
    // gelesen (siehe Kopf) — eine Zeile ohne Leser hat auch kein Ereignis.
    await db.create(MESSAGE_SETTINGS_TABLE, { enabled }, { permissions: [] })
  }

  forgetMessageSettings(event)
  return enabled
}

import type { H3Event } from 'h3'

/**
 * „WO WAR DIESER MENSCH ZULETZT AKTIV?" — als Cross-Layer-Vertrag
 * (F1 Stufe 3, Stück 4).
 *
 * ── Die Schuld, die das hier begleicht ─────────────────────────────────────
 * Davids Entscheidung 7 lautet: die Seitenleiste der Discussions zeigt „meine
 * letzten fünf Kategorien — in denen ich GEPOSTET ODER KOMMENTIERT habe".
 * Gebaut war bis hierher nur die erste Hälfte. Stufe 2 hat die zweite
 * ausdrücklich NICHT nachgereicht, und die Begründung dort ist der Grund,
 * warum es diesen Vertrag jetzt gibt (nachzulesen im Kopf von
 * posts/server/api/posts/discussions/sidebar.get.ts):
 *
 *   „Die letzten fünf" verlangt, meine Beiträge und meine Kommentare auf EINER
 *   Zeitachse zu ordnen. Die Zeitstempel der Kommentare kennt nur `comments`,
 *   die der Beiträge nur `posts`. Ohne gemeinsame Serverseite bliebe nur, die
 *   Kommentar-Zeiten durch den CLIENT zurückzureichen — eine Sortierung, die
 *   der Aufrufer bestimmt — oder zwei Ranglisten zu vermengen, deren Skalen
 *   nicht vergleichbar sind.
 *
 * Die gemeinsame Zeitachse IST also der Grund für den Vertrag, nicht ein
 * hübscher Nebeneffekt.
 *
 * ── NACH PROVIDER GESCHLÜSSELT, NICHT NACH TYP (Unterschied zu den anderen) ─
 * `registerContentActivityHandler`, `registerContentWriteGuard` und
 * `registerReportTarget` sind nach `targetType` geschlüsselt: dort gibt es je
 * Typ EINEN Besitzer, und die Frage wird an genau ihn WEITERGEREICHT.
 *
 * Hier ist es umgekehrt. Die Frage geht an ALLE und die Antworten werden
 * ZUSAMMENGEFÜHRT — heute antwortet `comments`, morgen vielleicht auch
 * `events` oder `courses`. Deshalb ist der Schlüssel eine Provider-Id, genau
 * wie bei `registerUserDataContributor`, das aus demselben Grund so gebaut ist
 * (jeder Layer trägt sein Stück zum Export bei).
 *
 * ── EIN AUSFALL DARF DIE SEITENLEISTE NICHT KOSTEN ────────────────────────
 * Ein werfender Provider wird übersprungen und protokolliert; die übrigen
 * Antworten gelten weiter. Das ist dieselbe Regel wie beim Aktivitäts-Vertrag
 * und ausdrücklich NICHT die des Schreib-Wächters: hier ist die Antwort ein
 * KOMFORT (fünf Verweise in einer Seitenleiste), dort war sie die BEDINGUNG
 * eines Schreibvorgangs. Eine leere Seitenleiste ist ein Schönheitsfehler, eine
 * unterlaufene Sperre ein Wortbruch.
 */

export interface UserActivityTarget {
  /** Art des Ziels, z. B. 'post' — dieselben Werte wie `comments.targetType`. */
  targetType: string
  /** Row-Id des Ziels. */
  targetId: string
  /** Wann der Nutzer dort zuletzt aktiv war (ISO). Die gemeinsame Zeitachse. */
  at: string
}

export interface UserActivityQuery {
  userId: string
  /**
   * Wie viele Einträge der Provider HÖCHSTENS liefern soll.
   *
   * Eine Obergrenze und keine exakte Zahl: der Aufrufer führt mehrere Quellen
   * zusammen und weiß erst danach, wie viele er behält. Ein Provider, der
   * weniger findet, ist völlig in Ordnung.
   */
  limit: number
}

export type UserActivityProvider = (
  event: H3Event,
  query: UserActivityQuery,
) => Promise<UserActivityTarget[]> | UserActivityTarget[]

const providers = new Map<string, UserActivityProvider>()

/**
 * Eine Quelle anmelden (Nitro-Plugin des besitzenden Layers). Die Id ist der
 * LAYER, nicht der Ziel-Typ — mehrere Layer dürfen zur selben Frage beitragen.
 */
export function registerUserActivityProvider(id: string, provider: UserActivityProvider): void {
  providers.set(id, provider)
}

/** Welche Quellen antworten in diesem Deployment? (Diagnose/Tests) */
export function registeredUserActivityProviders(): string[] {
  return [...providers.keys()]
}

/** Nur für Tests: Registry zurücksetzen. */
export function __resetUserActivityProviders(): void {
  providers.clear()
}

/**
 * PURE (unit-getestet): mehrere Antworten auf EINE Zeitachse legen.
 *
 * Neueste zuerst; je Ziel bleibt nur der jüngste Eintrag stehen. Das
 * Entdoppeln gehört hierher und nicht zu den Providern: wer zehnmal unter
 * demselben Beitrag geschrieben hat, war dort EINMAL zuletzt aktiv — und diese
 * Rechnung darf nicht davon abhängen, wie sorgfältig ein einzelner Layer sie
 * für sich anstellt.
 *
 * Getrennt von `collectUserActivity`, damit sie ohne Registry und ohne Event
 * prüfbar ist.
 */
export function mergeUserActivity(
  entries: readonly UserActivityTarget[],
  limit: number,
): UserActivityTarget[] {
  const newest = new Map<string, UserActivityTarget>()
  for (const entry of entries) {
    if (!entry.targetType || !entry.targetId || !entry.at) continue
    const key = `${entry.targetType}:${entry.targetId}`
    const known = newest.get(key)
    if (!known || entry.at > known.at) newest.set(key, entry)
  }
  return [...newest.values()]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, Math.max(0, limit))
}

/**
 * „Wo war dieser Mensch zuletzt aktiv?" — der EINE Aufruf für Konsumenten.
 *
 * Fragt alle angemeldeten Quellen (parallel — sie wissen nichts voneinander)
 * und führt sie über `mergeUserActivity` zusammen. Ohne Quellen: leere Liste,
 * kein Fehler — eine App ohne comments-Layer hat schlicht nichts beizutragen.
 */
export async function collectUserActivity(
  event: H3Event,
  userId: string,
  limit: number,
): Promise<UserActivityTarget[]> {
  if (!userId || limit <= 0 || providers.size === 0) return []

  const answers = await Promise.all([...providers.entries()].map(async ([id, provider]) => {
    try {
      return await provider(event, { userId, limit })
    }
    catch (error) {
      logEvent('warn', 'user_activity.provider_failed', {
        provider: id,
        message: error instanceof Error ? error.message : String(error),
      })
      return [] as UserActivityTarget[]
    }
  }))

  return mergeUserActivity(answers.flat(), limit)
}

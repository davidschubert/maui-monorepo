import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { type BadgeFacts, emptyBadgeFacts } from '../../shared/badges'
import { USER_BADGES_TABLE, type UserBadge } from '../../shared/types/post'

/**
 * VERLEIHUNG UND ZÄHLUNG (F1 Stufe 4) — die Serverseite der Abzeichen.
 *
 * ── WANN WIRD AUSGEWERTET? Beim HINSEHEN, und das ist eine Entscheidung ────
 * Es gibt keinen Lauf, der nachts alle Menschen durchrechnet. Ausgewertet wird,
 * wenn jemand seine Abzeichen-Seite öffnet — dort und nur dort.
 *
 * Der Preis ist ehrlich zu nennen: ein Abzeichen entsteht erst in dem Moment,
 * in dem sein Besitzer nachsieht. Das Verdienst ist älter, das VERLEIHDATUM
 * (`$createdAt`) ist der Moment des Nachsehens. Und genau deshalb gibt es hier
 * KEINE Benachrichtigung: „Du hast ein Abzeichen erhalten", ausgelöst durch
 * das Aufschlagen der Abzeichen-Seite, wäre Theater — die Nachricht käme
 * immer eine Sekunde nach dem Blick auf dasselbe.
 *
 * Die Alternative wäre ein regelmäßiger Lauf. Der braucht eine Kandidatenliste
 * („wer war seit dem letzten Lauf aktiv?"), die es hier nicht gibt, sonst
 * rechnete er bei jedem Durchgang über ALLE Konten aller Communities. Das ist
 * eine eigene Stufe mit eigener Infrastruktur — zusammen mit den Zählern, die
 * beim Schreiben mitschreiben, und dann kommt die Benachrichtigung mit.
 *
 * ── DIE VERLEIHUNG IST KEIN SCHREIBVORGANG DES MITGLIEDS ──────────────────
 * `as: 'operator', actor: 'operator'` — und die zweite Hälfte ist die
 * wichtige. Mit `actor: 'member'` hätte das Ansehen der eigenen
 * Abzeichen-Seite zwei Nebenwirkungen, die beide falsch wären:
 *  - A5: der Betrachter würde durch einen SEITENAUFRUF Mitglied der Community.
 *    Genau das schließt A5 ausdrücklich aus („ein Seitenaufruf löst bewusst
 *    NICHTS aus") — sonst wäre jeder Vorbeisurfer Mitglied.
 *  - M13: in einer wegen Zahlung stillgelegten Community wäre die
 *    Abzeichen-Seite ein 403. Ein Abzeichen ist aber kein Inhalt, den jemand
 *    beisteuert; es ist eine Feststellung über Vergangenes.
 * Verliehen wird also vom System. Das Mitglied hat gehandelt, als es den
 * Beitrag schrieb — nicht, als es die Seite öffnete.
 */

/**
 * PURE: aus den Zählern die Zahlen machen, gegen die der Katalog prüft.
 *
 * Ein fehlender Zähler wird zu 0 und nicht zu „unbekannt". Das ist die
 * gutmütige Richtung: eine ausgefallene Quelle verzögert ein Abzeichen, sie
 * verleiht nie eines zu viel.
 */
export function badgeFactsFrom(counters: Record<string, number>, thresholds: readonly number[]): BadgeFacts {
  const facts = emptyBadgeFacts()
  facts.profileComplete = (counters[COUNTER_PROFILE_COMPLETE] ?? 0) >= 1
  facts.likesGiven = counters[COUNTER_LIKES_GIVEN] ?? 0
  facts.flagsRaised = counters[COUNTER_FLAGS_RAISED] ?? 0
  for (const threshold of thresholds) {
    facts.likedItems[threshold] = counters[counterLikedItems(threshold)] ?? 0
    facts.likedTopics[threshold] = counters[counterLikedTopics(threshold)] ?? 0
    facts.likedReplies[threshold] = counters[counterLikedReplies(threshold)] ?? 0
  }
  return facts
}

/** Die schon verliehenen Abzeichen dieses Menschen: Schlüssel → Verleihdatum. */
export async function awardedBadges(event: H3Event, userId: string): Promise<Map<string, string>> {
  const { rows } = await tenantDb(event).list<UserBadge>(USER_BADGES_TABLE, [
    Query.equal('userId', userId),
    // Großzügig über den Katalog hinaus: ein Abzeichen, das später aus dem
    // Katalog fällt, behält seine Zeile — sie darf die aktuellen nicht
    // aus der Seite drängen.
    Query.limit(100),
  ])
  return new Map(rows.map(row => [row.badgeKey, row.$createdAt]))
}

/**
 * Fehlende Abzeichen verleihen. Antwort: Schlüssel → Verleihdatum der NEUEN.
 *
 * FAIL-SOFT je Abzeichen: schlägt eine Verleihung fehl, geht die Galerie
 * trotzdem auf und der nächste Aufruf holt sie nach. Ein 409 ist kein Fehler,
 * sondern die Antwort des Unique-Index auf zwei gleichzeitige Aufrufe — dann
 * hat das Abzeichen jemand anderes gerade angelegt.
 */
export async function grantBadges(event: H3Event, userId: string, keys: readonly string[]): Promise<Map<string, string>> {
  const granted = new Map<string, string>()
  if (keys.length === 0) return granted

  const db = tenantDb(event, { as: 'operator', actor: 'operator' })
  for (const badgeKey of keys) {
    try {
      const row = await db.create<UserBadge>(USER_BADGES_TABLE, { userId, badgeKey }, {
        // Sichtbar für die Community, nicht nur für den Besitzer: ein Abzeichen
        // ist eine öffentliche Auszeichnung, und die Galerie neben einem Namen
        // ist die nächste Stufe. Schreibrechte bekommt niemand — verliehen
        // wird ausschließlich hier.
        read: 'members',
      })
      granted.set(badgeKey, row.$createdAt)
    }
    catch (error) {
      logEvent('warn', 'badges.grant_failed', {
        badgeKey,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return granted
}

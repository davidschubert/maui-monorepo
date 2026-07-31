import { Permission, Query, Role, type Models } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { CommunityAudience } from '../../shared/types/tenant'
import { repermissionRow } from '../../shared/communityAudience'
import { useTenant } from './tenant'

/**
 * C18 — DER BESTANDS-UMZUG. Ein Umschalten der Sichtbarkeit ist erst dann
 * wahr, wenn die SCHON GESCHRIEBENEN Zeilen mitziehen: `read("any")` ⇄
 * `read("label:<communityId>")`. Ohne das hieße „nur für Mitglieder" bloß
 * „ab jetzt nur für Mitglieder" — der ganze bisherige Inhalt bliebe für jeden
 * Gast per Roh-REST lesbar, und genau davor warnt der C18-Eintrag.
 *
 * WARUM EINE REGISTRY UND KEINE LISTE HIER: core kennt die Tabellen der
 * Produkt-Layer nicht und darf es nicht (A14). Jeder Layer mit
 * veröffentlichten Zeilen meldet seine Tabellen per Nitro-Plugin an — dasselbe
 * Muster wie `registerUserDataContributor` (GDPR) und
 * `registerReportEscalationHandler`. Ein neuer Layer mit öffentlichem Inhalt
 * MUSS sich hier eintragen, sonst bleibt sein Bestand beim Umschalten stehen.
 *
 * WAS NICHT HIERHER GEHÖRT und warum:
 *  - `courses`: veröffentlichte Kurse tragen `read("users")`, nicht
 *    `read("any")` — sie waren nie öffentlich (courseAccess.ts begründet das
 *    ausführlich). Ein Umschalten hat dort nichts zu tun.
 *  - `pages`: die Zeilen tragen ÜBERHAUPT keine Permissions; öffentlich macht
 *    sie eine Route mit der Operator-Türklinke. Dort ist die Grenze
 *    `assertCommunityContentReadable()` (utils/communityAudience.ts), nicht ein
 *    Permission-Umzug.
 *  - `activities`, `notifications`, Presence: mitglieder-intern BY DESIGN. Sie
 *    tragen `read(label:…)` aus einem anderen Grund und dürfen von einer
 *    öffentlichen Community NIE aufgemacht werden.
 *
 * FAIL-LOUD: Fehler werden gezählt und im Ergebnis benannt (nicht geschluckt).
 * Der Vorgang ist idempotent und damit WIEDERAUFNEHMBAR — ein zweiter Lauf
 * überspringt alles Fertige und holt nur den Rest. Genau deshalb reicht als
 * „Resume" ein erneuter Aufruf mit demselben Ziel.
 */

export interface AudienceRepermissionTable {
  /** Layer-Name — nur fürs Protokoll („wer hat das angemeldet"). */
  layer: string
  /** Appwrite-Table-Id. */
  table: string
  /**
   * Zeilen, deren Leserecht zusätzlich auf einer DATEI im Storage liegt
   * (media: fileSecurity-Bucket). Die Datei bekommt DASSELBE Array — ein Bild,
   * dessen Row zu ist, dessen Datei aber offen, wäre kein Schutz.
   */
  bucket?: { bucketId: string, fileIdKey: string }
}

const registry = new Map<string, AudienceRepermissionTable>()

/** Anmelden (Nitro-Plugin des Layers). Zweimal dieselbe Tabelle = einmal. */
export function registerAudienceRepermissionTable(entry: AudienceRepermissionTable): void {
  registry.set(entry.table, entry)
}

/** Die angemeldeten Tabellen — stabile Reihenfolge (Anmeldereihenfolge). */
export function audienceRepermissionTables(): AudienceRepermissionTable[] {
  return [...registry.values()]
}

export interface AudienceRepermissionTableResult {
  layer: string
  table: string
  /** Gelesene Zeilen. */
  scanned: number
  /** Zeilen, deren Permissions geschrieben wurden. */
  changed: number
  /** Zeilen, bei denen der Schreibvorgang fehlschlug. */
  failed: number
  /** Abbruchgrund für DIESE Tabelle (Lese-Fehler, Zeitbudget). */
  note?: string
}

export interface AudienceRepermissionResult {
  communityId: string
  audience: CommunityAudience
  /** false = es blieb etwas offen (Fehler oder Zeitbudget) — erneut aufrufen. */
  complete: boolean
  scanned: number
  changed: number
  failed: number
  tables: AudienceRepermissionTableResult[]
}

/** Seitengröße des Cursor-Laufs. Bewusst klein: der Vorgang läuft SYNCHRON in
 *  einer Request-Antwort, und eine große Seite hält den Nutzer länger auf,
 *  ohne die Gesamtdauer zu verkürzen. */
const PAGE = 100

/** Zeitbudget einer Ausführung. Danach hört der Lauf SAUBER auf (an einer
 *  Seitengrenze) und meldet `complete: false` — statt in einen Gateway-Timeout
 *  zu laufen und den Bestand halb umgezogen zu hinterlassen, ohne dass es
 *  jemand erfährt. */
const DEFAULT_BUDGET_MS = 20_000

export interface RepermissionOptions {
  /** Das ZIEL-Publikum. Explizit, NICHT aus dem Request: unmittelbar nach dem
   *  Schreiben trägt der Tenant-Kontext dieses Requests noch das alte
   *  Publikum (Resolver-Cache ≤30 s). */
  audience: CommunityAudience
  budgetMs?: number
}

/**
 * Den Bestand EINER Community auf das Ziel-Publikum bringen.
 *
 * Läuft über die DATENTÜR (`tenantDb(event, { as: 'operator' })`): `list`
 * hängt den `communityId`-Filter an, `updatePermissions` belegt vor dem
 * Schreiben noch einmal die Zugehörigkeit. Der Preis ist ein zusätzlicher
 * Lesevorgang je GEÄNDERTER Zeile; das ist ein guter Tausch für einen
 * seltenen Vorgang, der sonst mit dem Admin-Client an der einzigen Grenze
 * vorbeischreiben würde, die es im Pool gibt.
 */
export async function repermissionCommunityRows(
  event: H3Event,
  options: RepermissionOptions,
): Promise<AudienceRepermissionResult> {
  const tenant = useTenant(event)
  const communityId = tenant?.communityId ?? ''
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS)

  // Die beiden Schreibweisen, zwischen denen umgezogen wird. Im Silo gibt es
  // keine Community-Grenze in der Zeile — dort ist das Mitglieder-Publikum
  // `Role.users()` (dieselbe Zeile wie in tenantReadRolesFor).
  const publicRead = Permission.read(Role.any())
  const membersRead = tenant?.mode === 'pool'
    ? (communityId ? Permission.read(Role.label(communityId)) : '')
    : Permission.read(Role.users())

  const db = tenantDb(event, { as: 'operator' })
  const admin = createAdminClient(event)

  const result: AudienceRepermissionResult = {
    communityId, audience: options.audience, complete: true,
    scanned: 0, changed: 0, failed: 0, tables: [],
  }

  // Fail-CLOSED: ohne gültige Mitglieder-Permission wird NICHTS angefasst.
  // Das ist der Pool-Datenfehler „Zeile ohne communityId" — dort zu raten
  // hieße, im Zweifel zu öffnen.
  if (!membersRead) {
    result.complete = false
    result.tables = audienceRepermissionTables().map(entry => ({
      ...entryHead(entry), scanned: 0, changed: 0, failed: 0,
      note: 'Kein Mitglieder-Publikum auflösbar (communityId fehlt) — nichts geändert',
    }))
    logEvent('error', 'community.audience_repermission_blocked', { communityId, audience: options.audience })
    return result
  }

  for (const entry of audienceRepermissionTables()) {
    const tableResult: AudienceRepermissionTableResult = { ...entryHead(entry), scanned: 0, changed: 0, failed: 0 }
    result.tables.push(tableResult)

    let cursor: string | undefined
    for (;;) {
      if (Date.now() > deadline) {
        tableResult.note = 'Zeitbudget erreicht — erneut aufrufen, der Lauf setzt fort'
        result.complete = false
        break
      }

      let rows: Models.Row[]
      try {
        const page = await db.list<Models.Row>(entry.table, [
          Query.limit(PAGE),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ])
        rows = page.rows
      }
      catch (error) {
        // Tabelle fehlt (Layer nicht migriert) oder transienter Lesefehler:
        // benennen, nicht schlucken — und den ganzen Lauf als unvollständig
        // melden, damit niemand „fertig" liest, wo etwas offen blieb.
        tableResult.note = `Lesen fehlgeschlagen: ${String(error)}`
        result.complete = false
        break
      }

      for (const row of rows) {
        tableResult.scanned++
        const next = repermissionRow(row.$permissions, { publicRead, membersRead, target: options.audience })
        if (!next) continue
        try {
          await db.updatePermissions(entry.table, row.$id, next)
          // Die Datei im Bucket trägt dasselbe Array (media). Sie kennt keinen
          // Mandanten — die Referenz auf der schon geprüften Zeile schon.
          if (entry.bucket) {
            const fileId = (row as unknown as Record<string, unknown>)[entry.bucket.fileIdKey]
            if (typeof fileId === 'string' && fileId) {
              await admin.storage.updateFile({
                bucketId: entry.bucket.bucketId, fileId, permissions: next,
              })
            }
          }
          tableResult.changed++
        }
        catch (error) {
          tableResult.failed++
          logEvent('error', 'community.audience_repermission_row_failed', {
            communityId, table: entry.table, rowId: row.$id, error: String(error),
          })
        }
      }

      if (rows.length < PAGE) break
      cursor = rows.at(-1)!.$id
    }

    result.scanned += tableResult.scanned
    result.changed += tableResult.changed
    result.failed += tableResult.failed
    if (tableResult.failed > 0) result.complete = false
  }

  logEvent(result.complete ? 'info' : 'warn', 'community.audience_repermissioned', {
    communityId,
    audience: options.audience,
    complete: result.complete,
    scanned: result.scanned,
    changed: result.changed,
    failed: result.failed,
  })
  return result
}

function entryHead(entry: AudienceRepermissionTable): { layer: string, table: string } {
  return { layer: entry.layer, table: entry.table }
}

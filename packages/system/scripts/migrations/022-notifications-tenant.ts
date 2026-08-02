/**
 * Migration system-022: `tenantId` auf `notifications` (Arbeitsliste C15,
 * Audit-Befund S6).
 *
 * WARUM: Row-Security trennt die Glocken heute schon korrekt nach EMPFÄNGER —
 * niemand liest fremde Zeilen. Der Befund ist ein anderer: wer in ZWEI
 * Communities Mitglied ist, sieht auf BEIDEN Hosts eine GEMISCHTE Glocke.
 * Titel, Texte und Links aus Community B erscheinen im UI von A, und die Links
 * zeigen auf Pfade, die es auf A nicht gibt. Die Zeile braucht den Mandanten
 * also nicht als Zugriffs-, sondern als ABLAGE-Merkmal.
 *
 * NUMMER: 021 war seit C1b vergeben (`activities.tenantId`, am 2026-07-29 auf
 * prod gefahren). OPEN-ITEMS C6 (Drop von `app_config.entitlements`) zeigte
 * ebenfalls auf 022 und ist auf 023 nachgezogen — C6 ist noch nicht gebaut,
 * diese Migration hier ist es.
 *
 * DREI WERTE, DREI BEDEUTUNGEN (core/shared/notificationScope.ts ist die eine
 * Stelle, die sie kennt):
 *  - `<tenantId>` → gehört DIESER Community. Sichtbar nur in ihrer Glocke.
 *  - `_account`   → gehört dem KUNDENBEREICH (Vertrag: Zahlungsproblem,
 *    Early-Access-Anfrage). Bewusst mandantenlos (Davids Entscheidung 3,
 *    2026-07-29) — ein Mitglied einer Kunden-Community darf keine
 *    Zahlungswarnung sehen, die den Betreiber-Vertrag betrifft. Der Wert ist
 *    kollisionsfrei: Appwrite-Row-Ids (und damit jede echte `tenantId`) dürfen
 *    NICHT mit einem Sonderzeichen beginnen, `_account` kann also niemals eine
 *    reale Mandanten-Id sein.
 *  - `''`         → unbekannt. Das ist der Wert der BESTANDSZEILEN und der
 *    Normalzustand im Silo (dort gibt es keine Mandanten).
 *
 * KEIN BACKFILL — und `''` ist hier bewusst FAIL-OPEN (Davids Entscheidung 2,
 * 2026-07-29). ABWEICHUNG von der sonst geltenden Regel (posts-004,
 * events-006, system-021 werten eine Zeile ohne Stempel im Pool als FREMD):
 * eine Notification ist kein Inhalt, den man vor jemandem verbergen muss —
 * ihr Empfänger steht in `recipientId`, und Row-Security lässt ohnehin nur ihn
 * heran. Fail-closed hieße hier: im Moment des Deploys leert sich JEDEM Nutzer
 * schlagartig die Glocke, weil keine einzige Bestandszeile einen Stempel hat.
 * Nachträglich zuordnen geht nicht, ohne für jede Zeile ihr Zielobjekt
 * nachzuschlagen. Also bleiben Bestandszeilen in JEDER Glocke sichtbar und
 * laufen mit der Zeit aus. NICHT „korrigieren" — die Ausnahme ist begründet
 * und steht auch am Lesepfad (core/shared/notificationScope.ts).
 *
 * INDEX: `idx_recipient_tenant` (recipientId, tenantId) — in dieser
 * Reihenfolge, weil der Empfänger der selektive Schlüssel ist und der
 * Mandanten-Wert nur noch nachfiltert. Die Bestands-Indizes bleiben, jeder
 * trägt weiter seinen Pfad: `recipient` (recipientId) den GDPR-/Sender-Weg,
 * `recipient_read` (recipientId, read) das „alles als gelesen markieren". Der
 * Digest-Sweep listet bewusst MANDANTENÜBERGREIFEND (read=false ohne
 * Empfänger) — das ist die dokumentierte Sweep-Ausnahme, kein fehlender Index.
 *
 * UNIQUE-INDIZES: keine. `notifications` ist ein Ereignis-Log ohne
 * Eindeutigkeits-Schlüssel; die Pool-Unique-Regel greift nicht.
 *
 * Idempotent (409 → skip), additiv und ruhend — alter Code ignoriert die
 * Spalte. Aufruf über den Runner:
 *
 *   pnpm migrate --app <app> --layer system
 *
 * Betroffene Prod-Instanzen: ALLE mit Datenebene (system ist implizites
 * Fundament jeder App) — control, pool (platform), comments, portfolio.
 * marketing und help haben keine Appwrite-Instanz.
 */
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { createIndexSteps } from '../../../../scripts/migrations-lib/indexRetry.mts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, databaseId)

const TABLE_ID = 'notifications'

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 409)) {
      console.log(`↷ ${label} (existiert bereits)`)
      return
    }
    throw error
  }
}

async function waitForColumn(tableId: string, key: string) {
  for (let i = 0; i < 30; i++) {
    // Query.limit ist PFLICHT (Falle aus events-006): der listColumns-Default
    // (25) würde die neue Spalte auf breiten Tabellen nie zeigen.
    const { columns } = await tablesDB.listColumns({ databaseId: databaseId!, tableId, queries: [Query.limit(200)] })
    const column = (columns as unknown as { key: string, status: string }[]).find(c => c.key === key)
    if (column?.status === 'available') return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Spalte "${tableId}.${key}" wurde nicht verfügbar`)
}

console.log(`Migration system-022 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const table = await tablesDB.getTable({ databaseId, tableId: TABLE_ID }).catch((error) => {
  if (hasCode(error, 404)) return null
  throw error
})
if (!table) {
  console.log(`↷ Table ${TABLE_ID} fehlt — system-003 zuerst ausführen`)
  process.exit(0)
}

// size 36 = Appwrite-Row-Id-Länge (wie posts-004/system-021); der Sentinel
// `_account` ist kürzer und passt.
await step(`Column ${TABLE_ID}.tenantId`, () => tablesDB.createVarcharColumn({
  databaseId, tableId: TABLE_ID, key: 'tenantId', size: 36, required: false, xdefault: '',
}))
await waitForColumn(TABLE_ID, 'tenantId')

await indexStep(`Index ${TABLE_ID}.idx_recipient_tenant`, {
  tableId: TABLE_ID, key: 'idx_recipient_tenant',
  type: TablesDBIndexType.Key, columns: ['recipientId', 'tenantId'],
})

console.log('✔ Migration system-022 fertig')

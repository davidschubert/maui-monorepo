/**
 * Migration control-027: `reserved_names` — die Betreiber-Zusatzliste der
 * gesperrten Subdomains (Davids Wunsch 2026-07-30).
 *
 * WARUM ÜBERHAUPT EINE TABELLE. Gesperrt ist heute, was in `RESERVED_SUBDOMAINS`
 * (packages/control/schemas/tenant.ts) steht — eine Code-Konstante. Das ist für
 * die Namen der Plattform genau richtig: sie sind Teil der Architektur, ihre
 * Sperre gehört versioniert und reviewbar in den Code. Es ist aber der falsche
 * Weg für den Alltag: „sperr mir bitte noch `presse` weg" darf kein Deploy
 * kosten. Deshalb ZWEI Quellen mit klarer Rollenteilung:
 *   - Code-Basisliste  → System-Einträge, UNLÖSCHBAR, wirkt SYNCHRON im Zod-Schema.
 *   - diese Tabelle    → Betreiber-Einträge, jederzeit änderbar, wirkt
 *                        ASYNCHRON in den Anlege-Pfaden (server-seitig).
 * Die Zod-Schemas bleiben unangetastet: sie sind synchron und können keine
 * Datenbank fragen. Ein Eintrag hier ersetzt also keine Validierung, er kommt
 * DAZU — geprüft in tenants/index.post.ts, onboarding/site.post.ts und
 * onboarding/precheck.post.ts.
 *
 * DIE ROW-ID IST DER NAME. Kein `name`-Feld, kein Unique-Index: eine Row-Id ist
 * in Appwrite pro Tabelle eindeutig, und ein zweiter Versuch scheitert mit 409 —
 * genau die Antwort, die die Route ohnehin geben will. Der Nachschlag beim
 * Anlegen einer Community ist damit ein `getRow` (ein Schlüsselzugriff) statt
 * einer gefilterten Liste.
 * ACHTUNG, die daraus folgende Grenze: eine Appwrite-Row-Id fasst 36 Zeichen.
 * Die Regel in shared/reservedNames.ts kappt deshalb bei 36 und nicht bei
 * SLUG_MAX (40) — sonst nähme die Oberfläche einen Namen an, den die Datenbank
 * nicht speichern kann.
 *
 * Keine Berechtigungen, keine Row-Security: gelesen und geschrieben wird
 * ausschließlich server-seitig mit dem Admin-Client des Control Plane. Ein
 * Browser hat in diesem Projekt nichts zu suchen.
 *
 * Idempotent (409 → skip). Aufruf über den Runner:
 *   pnpm migrate --app control --layer control
 */
import { Client, TablesDB } from 'node-appwrite'

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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

const TABLE = 'reserved_names'

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

async function waitForColumns(tableId: string) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId })
    if (columns.length > 0 && columns.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-027 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

await step(`Table ${TABLE}`, () => tablesDB.createTable({
  databaseId: db, tableId: TABLE, name: 'Reserved Names',
  permissions: [], rowSecurity: false,
}))

// Die einzige Spalte: warum ist der Name gesperrt. Optional — der häufige Fall
// („kommt noch") braucht keine Begründung, und ein Pflichtfeld hätte hier nur
// zu Platzhaltern geführt.
await step(`Column ${TABLE}.note`, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: TABLE, key: 'note', size: 200, required: false, xdefault: '',
}))

await waitForColumns(TABLE)

console.log('✔ Migration control-027 fertig')

/**
 * Migration control-036: EIGENE DOMAIN JE SILO-WEBSITE.
 *
 * Davids Auftrag vom 2026-08-07: er will nie wieder von Hand an ploi- oder
 * DNS-Panels. control-035 hat das für POOL-Communities gebaut (Spalten an
 * `communities`); diese Migration bringt dasselbe an die andere Sorte Site —
 * die SILOS, die im Betreiber-Register `websites` stehen (portfolio, comments).
 *
 * ── WARUM `websites` UND NICHT NOCH EINMAL `communities` ───────────────────
 * Weil ein Silo keine Community IST. Er hat kein `communities`-Row, keinen
 * Plan, keine Mitglieder und keinen Mandanten-Kontext — er ist eine eigene
 * App mit eigenem Appwrite-Projekt. Was er hat, ist genau eine Zeile in
 * `websites` (das ist es, was `control.pukalani.app/dashboard/websites`
 * anzeigt), und die ist über `projectId` mit der laufenden App verbunden
 * (F6-Identität, dieselbe, an der schon die Entitlements hängen).
 *
 * Die SECHS Domain-Spalten heißen deshalb wie ihre Geschwister an
 * `communities` — gleiche Namen, gleiche Bedeutung, gleiche fail-closed-
 * Lesart. Nur die ZEILE ist eine andere.
 *
 * ── ZWEI SPALTEN, DIE ES BEI `communities` NICHT GIBT ─────────────────────
 * `ploiServerId` / `ploiSiteId`. Bei einer Pool-Community ist das Ziel immer
 * dasselbe (die eine `platform`-Site), deshalb steht es dort in der Env. Ein
 * SILO hat seine EIGENE ploi-Site — portfolio 390041, comments 389772, beide
 * auf Server 118713 — und das gehört als DATEN neben die Zeile, nicht als
 * `if (slug === 'portfolio')` in den Code. Ohne sie müsste man für jede neue
 * Silo-Site deployen.
 *
 * ── WARUM DAS ZERTIFIKAT HIER GEFAHRLOS AUF DIE *SITE* GEHT ───────────────
 * CLAUDE.md verbietet Zertifikatsanforderungen auf der Site `pukalani.app`:
 * dort liegt das Kunden-Wildcard, und ploi benennt die certbot-Lineage nach
 * der Root-Domain DER SITE. Bei einem Silo ist das eine ANDERE Lineage —
 * am 2026-08-07 nachgemessen (ploi-API, Site 390041): ein einzelnes
 * Let's-Encrypt-Zertifikat mit `domain: "portfolio.pukalani.app"`,
 * `tenant: false`. Eine Anforderung dort fasst das Wildcard nicht an. Bei der
 * Pool-Site war der Umweg über ploi-TENANTS nötig, hier ist er es nicht — ein
 * Silo bedient EINE App, und die Kundendomain soll denselben vHost bekommen.
 *
 * ── KEIN UNIQUE-INDEX, AUS DEMSELBEN GRUND WIE BEI control-035 ────────────
 * Die Spalte ist optional mit Default `''`, und leere Strings kollidieren in
 * MariaDB in einem Unique-Index. Die Eindeutigkeit setzt der CODE durch, und
 * zwar über BEIDE Formen (`customDomainForms()`) UND über beide Tabellen:
 * eine Domain, die schon eine Community bedient, darf kein Silo bekommen und
 * umgekehrt. Das kann ein Index ohnehin nicht.
 *
 *   pnpm migrate --app control --layer control
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

const db = databaseId
const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const { indexStep } = createIndexSteps(tablesDB, db)

const WEBSITES = 'websites'

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

async function existingColumnKeys(tableId: string): Promise<Set<string>> {
  try {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    return new Set(columns.map(column => column.key))
  }
  catch (error) {
    if (hasCode(error, 404)) return new Set()
    throw error
  }
}

async function columnStep(label: string, key: string, existing: Set<string>, run: () => Promise<unknown>) {
  if (existing.has(key)) {
    console.log(`↷ ${label} (existiert bereits)`)
    return
  }
  await step(label, run)
}

async function waitForColumns(tableId: string, keys: string[]) {
  for (let i = 0; i < 30; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId: db, tableId, queries: [Query.limit(200)] })
    const wanted = columns.filter(column => keys.includes(column.key))
    if (wanted.length === keys.length && wanted.every(column => column.status === 'available')) return
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`Columns ${keys.join(', ')} von "${tableId}" wurden nicht verfügbar`)
}

console.log(`Migration control-036 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

const cols = await existingColumnKeys(WEBSITES)

// ── Wohin bei ploi? Daten, nicht Code. ──────────────────────────────────────
// Beide als VARCHAR und nicht als Integer, obwohl ploi Zahlen vergibt: sie
// werden nur durchgereicht (URL-Segment), nie gerechnet. Ein leerer String
// heißt „nicht hinterlegt" — bei einem Integer müsste man 0 dafür missbrauchen.
await columnStep(`Column ${WEBSITES}.ploiServerId`, 'ploiServerId', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: WEBSITES, key: 'ploiServerId', size: 20, required: false, xdefault: '',
}))
await columnStep(`Column ${WEBSITES}.ploiSiteId`, 'ploiSiteId', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: WEBSITES, key: 'ploiSiteId', size: 20, required: false, xdefault: '',
}))

// ── Die sechs Domain-Spalten, namensgleich mit control-035 ──────────────────
await columnStep(`Column ${WEBSITES}.customDomain`, 'customDomain', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: WEBSITES, key: 'customDomain', size: 253, required: false, xdefault: '',
}))
await columnStep(`Column ${WEBSITES}.customDomainStatus`, 'customDomainStatus', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: WEBSITES, key: 'customDomainStatus', size: 20, required: false, xdefault: '',
}))
await columnStep(`Column ${WEBSITES}.customDomainToken`, 'customDomainToken', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: WEBSITES, key: 'customDomainToken', size: 32, required: false, xdefault: '',
}))
await columnStep(`Column ${WEBSITES}.customDomainError`, 'customDomainError', cols, () => tablesDB.createVarcharColumn({
  databaseId: db, tableId: WEBSITES, key: 'customDomainError', size: 500, required: false, xdefault: '',
}))
await columnStep(`Column ${WEBSITES}.customDomainVerifiedAt`, 'customDomainVerifiedAt', cols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: WEBSITES, key: 'customDomainVerifiedAt', required: false,
}))
await columnStep(`Column ${WEBSITES}.customDomainActivatedAt`, 'customDomainActivatedAt', cols, () => tablesDB.createDatetimeColumn({
  databaseId: db, tableId: WEBSITES, key: 'customDomainActivatedAt', required: false,
}))

await waitForColumns(WEBSITES, [
  'ploiServerId',
  'ploiSiteId',
  'customDomain',
  'customDomainStatus',
  'customDomainToken',
  'customDomainError',
  'customDomainVerifiedAt',
  'customDomainActivatedAt',
])

// DER INDEX, AN DEM DIE MIDDLEWARE JEDER SILO-APP HÄNGT. Sie fragt bei jedem
// Request (gecacht, 30 s) „welche Adresse ist meine?" über `projectId`. Diese
// Abfrage lief bisher schon ohne Index (der Entitlement-Pull macht sie seit
// M6), aber als Tabellendurchlauf — mit der Middleware wird sie zum heißen
// Pfad JEDER Silo-Seite und bekommt deshalb ihren Index.
await indexStep(`Index ${WEBSITES}.idx_project`, {
  tableId: WEBSITES, key: 'idx_project',
  type: TablesDBIndexType.Key, columns: ['projectId'],
})
// Und die Gegenrichtung: „gehört diese Domain schon jemandem?" beim Eintragen.
await indexStep(`Index ${WEBSITES}.idx_custom_domain`, {
  tableId: WEBSITES, key: 'idx_custom_domain',
  type: TablesDBIndexType.Key, columns: ['customDomain'],
})

console.log('✔ Migration control-036 fertig — 8 Spalten an websites, Indizes idx_project + idx_custom_domain.')

/**
 * Migration control-026: E8-Aufräumen — die Alt-Objekte der Etappen 1+2 fallen.
 *
 * control-022 hat `sites` → `websites` kopiert (Zeilen MIT Row-Id), control-023
 * `site_members`/`site_invites` → `community_members`/`community_invites` und
 * `invite_requests.siteId` → `communityId`. Seitdem liest und schreibt kein
 * Code mehr die alten Namen (am 2026-07-30 per grep über packages/apps/scripts
 * belegt — Treffer sind nur embed_sites und site.manifest-Identitäten).
 * David hat die Beobachtungsnacht erlassen (2026-07-30, kein Produktivbetrieb).
 *
 * IDEMPOTENT über 404. Auf einem frischen Bootstrap legen die alten
 * Migrationen die Objekte weiter an (Protokoll) und diese räumt sie ab —
 * jede Instanz erreicht denselben Endzustand.
 *
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

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function step(label: string, run: () => Promise<unknown>) {
  try {
    await run()
    console.log(`✔ ${label}`)
  }
  catch (error) {
    if (hasCode(error, 404)) {
      console.log(`↷ ${label} (schon weg)`)
      return
    }
    throw error
  }
}

console.log(`Migration control-026 gegen ${endpoint} / Projekt ${projectId} / DB ${db}`)

// SICHERUNG vor dem Löschen: die Nachfolger müssen existieren UND mindestens
// so viele Zeilen tragen wie die Alt-Tabellen — sonst bricht der Lauf ab,
// bevor irgendetwas fällt (Kopie unvollständig ⇒ nie löschen).
async function rowCount(tableId: string): Promise<number | null> {
  try {
    const { total } = await tablesDB.listRows({ databaseId: db, tableId, queries: [] })
    return total
  }
  catch (error) {
    if (hasCode(error, 404)) return null
    throw error
  }
}

for (const [alt, neu] of [['site_members', 'community_members'], ['site_invites', 'community_invites'], ['sites', 'websites']] as const) {
  const altTotal = await rowCount(alt)
  if (altTotal === null) continue // Alt-Tabelle schon weg — nichts zu sichern
  const neuTotal = await rowCount(neu)
  if (neuTotal === null || neuTotal < altTotal) {
    throw new Error(`Abbruch: ${neu} trägt ${neuTotal ?? 'keine'} Zeile(n), ${alt} aber ${altTotal} — Kopie unvollständig, es wird NICHTS gelöscht.`)
  }
  console.log(`✔ Gegenprobe ${alt} (${altTotal}) ≤ ${neu} (${neuTotal})`)
}

// destruktiv-ok: E8-Aufräumen — Nachfolger community_members/community_invites/
// websites tragen die Zeilen MIT Row-Ids (control-022/023), die Gegenprobe
// oben bricht VOR jedem Löschen ab, wenn eine Kopie unvollständig wäre; kein
// Code liest/schreibt die alten Namen mehr (grep-Beweis 2026-07-30).
await step('Table site_members löschen', () => tablesDB.deleteTable({ databaseId: db, tableId: 'site_members' }))
await step('Table site_invites löschen', () => tablesDB.deleteTable({ databaseId: db, tableId: 'site_invites' }))
await step('Table sites löschen', () => tablesDB.deleteTable({ databaseId: db, tableId: 'sites' }))
await step('Column invite_requests.siteId löschen', () => tablesDB.deleteColumn({
  databaseId: db, tableId: 'invite_requests', key: 'siteId',
}))

console.log('✔ Migration control-026 fertig — E8-Altbestand ist abgeräumt.')

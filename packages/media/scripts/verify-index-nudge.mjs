/**
 * F19-Beweis am lebenden Appwrite: überlebt `indexStep` mit `tableCacheNudge`
 * einen VERGIFTETEN Metadaten-Cache?
 *
 * Das Rennen selbst ist lokal kaum zu treffen (Fenster im Millisekundenbereich
 * auf einer unbelasteten Maschine). Der vergiftete ZUSTAND lässt sich aber
 * exakt herstellen: der Cache-Eintrag des Collection-Dokuments wird in Redis
 * auf 'processing' zurückgedreht — genau das, was ein Leser im Fenster nach dem
 * purge zurückschreibt. Aus diesem Zustand führt kein Wiederhol-Vorrat heraus;
 * der Anstoß muss es tun.
 *
 * GEGENPROBE eingebaut: derselbe Ablauf OHNE Anstoß muss scheitern. Ohne sie
 * wäre der Beweis wertlos — er wäre auch dann grün, wenn der Anstoß gar nichts
 * bewirkt oder die Vergiftung nicht greift.
 *
 * Braucht die lokale Docker-Appwrite (Redis-Zugriff über `docker exec`):
 *
 *   node --env-file=apps/comments/.env packages/media/scripts/verify-index-nudge.mjs
 */
import { execFileSync } from 'node:child_process'
import { Client, Query, TablesDB, TablesDBIndexType } from 'node-appwrite'
import { indexStep, tableCacheNudge } from '../../../scripts/migrations-lib/indexRetry.mts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
const redisContainer = process.env.APPWRITE_REDIS_CONTAINER || 'appwrite-redis'

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — über --env-file aufrufen.')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (label, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}
const redis = (...args) => execFileSync('docker', ['exec', redisContainer, 'redis-cli', ...args], { encoding: 'utf8' }).trim()

async function warteAufSpalte(tableId, key) {
  for (let i = 0; i < 40; i++) {
    const { columns } = await tablesDB.listColumns({ databaseId, tableId, queries: [Query.limit(200)] })
    if (columns.find(c => c.key === key)?.status === 'available') return true
    await sleep(200)
  }
  return false
}

/** Dreht die Spalte im gecachten Collection-Dokument auf 'processing' zurück. */
function vergifte(tableId, spalte) {
  const key = redis('--scan', '--pattern', `*collection*${tableId}*`).split('\n').filter(Boolean)[0]
  if (!key) return false
  const feld = redis('HKEYS', key).split('\n').filter(Boolean)[0]
  const eintrag = JSON.parse(redis('HGET', key, feld))
  let getroffen = false
  for (const a of eintrag.data.attributes) {
    if (a.key === spalte) { a.status = 'processing'; getroffen = true }
  }
  if (!getroffen) return false
  execFileSync('docker', ['exec', '-i', redisContainer, 'redis-cli', '-x', 'HSET', key, feld],
    { input: JSON.stringify(eintrag) })
  return true
}

const tableId = `f19_nudge_${Date.now().toString(36)}`

try {
  console.log(`\nF19 — Index-Anstoß gegen ${endpoint}\nWegwerf-Tabelle ${tableId}\n`)
  await tablesDB.createTable({ databaseId, tableId, name: 'F19 Anstoß-Beweis', rowSecurity: true })

  console.log('1. Gegenprobe: OHNE Anstoß muss es scheitern')
  await tablesDB.createVarcharColumn({ databaseId, tableId, key: 'ohne', size: 36, required: false, xdefault: '' })
  check('Spalte "ohne" verfügbar', await warteAufSpalte(tableId, 'ohne'))
  await tablesDB.getTable({ databaseId, tableId })
  check('Cache vergiftet', vergifte(tableId, 'ohne'))
  let ohneFehler = null
  try {
    // Kurzer Vorrat genügt: aus dem vergifteten Zustand führt keiner heraus.
    await indexStep(`Index ${tableId}.idx_ohne`, () => tablesDB.createIndex({
      databaseId, tableId, key: 'idx_ohne', type: TablesDBIndexType.Key, columns: ['ohne'],
    }))
  }
  catch (error) { ohneFehler = error }
  check('ohne Anstoß: Index scheitert (Vorrat läuft leer)', ohneFehler !== null,
    ohneFehler ? '' : 'ging unerwartet durch — Vergiftung wirkt nicht?')

  console.log('\n2. MIT Anstoß muss derselbe Zustand überlebt werden')
  await tablesDB.createVarcharColumn({ databaseId, tableId, key: 'mit', size: 36, required: false, xdefault: '' })
  check('Spalte "mit" verfügbar', await warteAufSpalte(tableId, 'mit'))
  await tablesDB.getTable({ databaseId, tableId })
  check('Cache vergiftet', vergifte(tableId, 'mit'))

  const start = Date.now()
  let mitOk = true
  try {
    await indexStep(`Index ${tableId}.idx_mit`, () => tablesDB.createIndex({
      databaseId, tableId, key: 'idx_mit', type: TablesDBIndexType.Key, columns: ['mit'],
    }), tableCacheNudge(tablesDB, databaseId, tableId))
  }
  catch (error) { mitOk = false; console.log(`    (${error?.message})`) }
  const dauer = ((Date.now() - start) / 1000).toFixed(1)
  check(`mit Anstoß: Index kommt durch (${dauer}s)`, mitOk)

  const { indexes } = await tablesDB.listIndexes({ databaseId, tableId })
  check('Index steht wirklich in der Tabelle', indexes.some(i => i.key === 'idx_mit'),
    indexes.map(i => i.key).join(',') || '(keiner)')

  console.log('\n3. Der Anstoß darf nichts verstellen')
  const danach = await tablesDB.getTable({ databaseId, tableId })
  check('rowSecurity ist noch an', danach.rowSecurity === true, String(danach.rowSecurity))
  check('Tabelle ist noch aktiviert', danach.enabled === true, String(danach.enabled))
}
catch (error) {
  fail++
  console.error(`\n✗ Abbruch: ${error?.message ?? error}`)
}
finally {
  await tablesDB.deleteTable({ databaseId, tableId }).catch(() => {})
  console.log(`\nWegwerf-Tabelle entfernt.\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  process.exit(fail === 0 ? 0 : 1)
}

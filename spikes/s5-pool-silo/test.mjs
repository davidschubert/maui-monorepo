/**
 * S5-Abnahmetests (reine Logik, kein Server nötig): `node test.mjs`.
 * Beweist den Pool+Silo-Kern aus HORIZONT-3-POOL-SILO-BLUEPRINT.md.
 *
 *  T1  resolveTenant: Host → pool / silo / null (keine Default-Site)
 *  T2  scopeQuery: Pool hängt tenantId an, Silo lässt Query unberührt
 *  T3  scopeRow: Pool setzt tenantId, Silo nicht
 *  T4  Pool-Isolation MIT Scope: Tenant A sieht nur A-Zeilen
 *  T5  Defense-in-Depth: scopeQuery VERGESSEN → Permission-Ebene blockt trotzdem
 *  T6  Cross-Tenant-Write: A schreibt, B kann es nie lesen (beидe Richtungen)
 *  T7  Silo-Isolation: zwei Silos = zwei DBs, keine geteilten Zeilen
 *  T8  Pool-Host ohne tenantId ist ein harter Fehler (Fehlkonfiguration)
 */
import {
  resolveTenant, scopeQuery, scopeRow,
  FakeTablesDB, clientLabels, rowReadLabels,
} from './tenancy.mjs'

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✔ ${name}`) }
  else { failed++; console.error(`✗ ${name} ${detail}`) }
}
function throws(fn) { try { fn(); return false } catch { return true } }

const REGISTER = {
  'acme.maui.app': { mode: 'pool', projectId: 'pool-1', tenantId: 'acme' },
  'globex.maui.app': { mode: 'pool', projectId: 'pool-1', tenantId: 'globex' },
  'bigcorp.com': { mode: 'silo', projectId: 'silo-bigcorp' },
}

// T1 — Auflösung
const acme = resolveTenant('acme.maui.app', REGISTER)
const globex = resolveTenant('globex.maui.app', REGISTER)
const bigcorp = resolveTenant('bigcorp.com', REGISTER)
check('T1a pool-Host → pool + tenantId', acme.mode === 'pool' && acme.tenantId === 'acme' && acme.projectId === 'pool-1')
check('T1b silo-Host → silo, kein tenantId', bigcorp.mode === 'silo' && bigcorp.tenantId === undefined)
check('T1c unbekannter Host → null (keine Default-Site)', resolveTenant('evil.com', REGISTER) === null)

// T2 — scopeQuery
const pooledQ = scopeQuery(acme, [{ field: 'status', value: 'open' }])
check('T2a pool: tenantId-Filter angehängt', pooledQ.length === 2 && pooledQ.some(q => q.field === 'tenantId' && q.value === 'acme'))
const siloQ = scopeQuery(bigcorp, [{ field: 'status', value: 'open' }])
check('T2b silo: Query unberührt (kein tenantId)', siloQ.length === 1 && !siloQ.some(q => q.field === 'tenantId'))

// T3 — scopeRow
check('T3a pool: scopeRow setzt tenantId', scopeRow(acme, { text: 'hi' }).tenantId === 'acme')
check('T3b silo: scopeRow ohne tenantId', scopeRow(bigcorp, { text: 'hi' }).tenantId === undefined)

// --- Pool-DB mit zwei Mandanten (acme + globex teilen pool-1) ---
const pool = new FakeTablesDB()
// beide schreiben je 2 Zeilen, jeweils korrekt gescoped
for (const ctx of [acme, globex]) {
  pool.createRow(scopeRow(ctx, { text: `${ctx.tenantId}-1` }), rowReadLabels(ctx))
  pool.createRow(scopeRow(ctx, { text: `${ctx.tenantId}-2` }), rowReadLabels(ctx))
}

// T4 — Pool-Isolation MIT korrektem Scope
const acmeSeen = pool.listRows(scopeQuery(acme, []), clientLabels(acme))
check('T4a acme sieht genau seine 2 Zeilen', acmeSeen.length === 2 && acmeSeen.every(r => r.tenantId === 'acme'))
const globexSeen = pool.listRows(scopeQuery(globex, []), clientLabels(globex))
check('T4b globex sieht genau seine 2 Zeilen', globexSeen.length === 2 && globexSeen.every(r => r.tenantId === 'globex'))

// T5 — DEFENSE-IN-DEPTH: scopeQuery VERGESSEN (leere Query trotz pool-Kontext)
// Der Feature-Autor hat den Scope-Helper vergessen — die Permission-Ebene MUSS
// trotzdem Fremdmandanten-Zeilen zurückhalten.
const acmeForgotScope = pool.listRows([], clientLabels(acme))
check('T5 scopeQuery vergessen → Permission-Ebene blockt Fremd-Zeilen',
  acmeForgotScope.length === 2 && acmeForgotScope.every(r => r.tenantId === 'acme'),
  `(sah ${acmeForgotScope.length} Zeilen: ${acmeForgotScope.map(r => r.tenantId).join(',')})`)

// T6 — Cross-Tenant-Read-Versuch: acme-Client versucht globex-Filter zu forcieren
const acmeTriesGlobex = pool.listRows([{ field: 'tenantId', value: 'globex' }], clientLabels(acme))
check('T6a acme kann globex nicht per Filter erzwingen', acmeTriesGlobex.length === 0)
const globexTriesAcme = pool.listRows([{ field: 'tenantId', value: 'acme' }], clientLabels(globex))
check('T6b globex kann acme nicht per Filter erzwingen', globexTriesAcme.length === 0)

// T7 — Silo-Isolation: zwei Silos sind physisch getrennte DBs
const siloA = new FakeTablesDB()
const siloB = new FakeTablesDB()
const bigcorp2 = resolveTenant('bigcorp.com', REGISTER)
siloA.createRow(scopeRow(bigcorp2, { text: 'geheim-A' }), rowReadLabels(bigcorp2))
const siloBSees = siloB.listRows(scopeQuery(bigcorp2, []), clientLabels(bigcorp2))
check('T7 Silo B kennt Silo-A-Zeilen nicht (getrennte Projekte)', siloBSees.length === 0)
check('T7b Silo A sieht seine eigene Zeile', siloA.listRows(scopeQuery(bigcorp2, []), clientLabels(bigcorp2)).length === 1)

// T8 — Fehlkonfiguration: Pool-Host ohne tenantId
check('T8 Pool-Host ohne tenantId wirft', throws(() => resolveTenant('x', { x: { mode: 'pool', projectId: 'p' } })))

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)

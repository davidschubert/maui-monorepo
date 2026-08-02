import { Client, ID, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import { createCommunityHostResolver } from '../server/utils/communityHostResolver'
import { COMMUNITIES_TABLE } from '../shared/types/tenantRecord'

/**
 * D5 — der Cross-Projekt-Leser hinter `registerCommunityHostResolver`.
 *
 * Gegen eine ECHTE Appwrite, env-gated wie tenants-resolver.test.ts daneben.
 * Ein Fixture-Test würde hier das Entscheidende VERFEHLEN: die eine Frage, an
 * der dieser Resolver still scheitern kann, ist, ob er die richtige SPALTE
 * nachschlägt. Der Wert in `notifications.communityId` ist
 * `communities.tenantId` (`t-…`), nicht `communities.$id` — und weil der
 * Vertrag fail-soft ist, sähe ein Nachschlagen über `$id` exakt wie „Host nicht
 * auflösbar" aus: die Mail ginge raus, mit dem falschen Link, ohne einen Fehler
 * im Log. Genau diese Verwechslung ist mit E8-3 (Spalte umbenannt, Wert nicht)
 * greifbar nahe.
 */

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

describe.skipIf(!hasEnv)('createCommunityHostResolver (echte Appwrite)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  const createdIds: string[] = []
  const stamp = Date.now()
  const TENANT_A = `t-hostres-a-${stamp}`
  const TENANT_B = `t-hostres-b-${stamp}`
  const TENANT_OFF = `t-hostres-off-${stamp}`
  const HOST_A = `a-${stamp}.test.local`
  const HOST_B = `b-${stamp}.test.local`
  const HOST_OFF = `off-${stamp}.test.local`

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: COMMUNITIES_TABLE, rowId: id }).catch(() => {})
    }
  })

  async function seed(host: string, tenantId: string, status: 'active' | 'disabled', suspension = '') {
    const row = await tablesDB.createRow({
      databaseId: databaseId!, tableId: COMMUNITIES_TABLE, rowId: ID.unique(),
      data: { host, mode: 'pool', projectId: 'shared-project', tenantId, status, suspension },
    })
    createdIds.push(row.$id)
    return row
  }

  it('löst mehrere Communities in EINER Abfrage auf und cached (positiv wie negativ)', async () => {
    const rowA = await seed(HOST_A, TENANT_A, 'active')
    await seed(HOST_B, TENANT_B, 'active')
    await seed(HOST_OFF, TENANT_OFF, 'disabled')

    const resolve = createCommunityHostResolver({
      endpoint: endpoint!, projectId: projectId!, apiKey: apiKey!, databaseId: databaseId!, cacheTtlMs: 60_000,
    })

    const hosts = await resolve([TENANT_A, TENANT_B, TENANT_OFF, `t-gibt-es-nicht-${stamp}`])
    // Gebündelt: viele Ids rein, EINE Karte raus (der Digest-Sweep mischt
    // Communities, ein Aufruf je Mail wäre die N+1-Falle über Projektgrenzen).
    expect(hosts[TENANT_A]).toBe(HOST_A)
    expect(hosts[TENANT_B]).toBe(HOST_B)
    // Abgeschaltet = nicht auflösbar: ein Link dorthin wäre eine Sackgasse (404).
    expect(hosts).not.toHaveProperty(TENANT_OFF)
    // Unbekanntes FEHLT in der Karte — es steht nicht als leerer String drin.
    expect(hosts).not.toHaveProperty(`t-gibt-es-nicht-${stamp}`)

    // Cache-Beweis (positiv): Host ändern — innerhalb der TTL bleibt der alte.
    await tablesDB.updateRow({
      databaseId: databaseId!, tableId: COMMUNITIES_TABLE, rowId: rowA.$id, data: { host: `neu-${stamp}.test.local` },
    })
    await expect(resolve([TENANT_A])).resolves.toMatchObject({ [TENANT_A]: HOST_A })

    // Cache-Beweis (negativ): eine gerade erst angelegte Community bleibt
    // innerhalb der TTL unbekannt. Ohne dieses Negativ-Caching fragt JEDE Mail
    // mit einer Bestandszeile das Control Plane erneut.
    const late = `t-hostres-late-${stamp}`
    await expect(resolve([late])).resolves.toEqual({})
    await seed(`late-${stamp}.test.local`, late, 'active')
    await expect(resolve([late])).resolves.toEqual({})
  })

  it('schlägt über tenantId nach, NICHT über $id', async () => {
    // Der Härtefall: die Row-$id einer Community ist nie ihr Ablage-Wert.
    // Fragte der Resolver `$id` ab, wäre der nächste Test grün und dieser rot.
    const row = await seed(`byid-${stamp}.test.local`, `t-hostres-byid-${stamp}`, 'active')
    const resolve = createCommunityHostResolver({
      endpoint: endpoint!, projectId: projectId!, apiKey: apiKey!, databaseId: databaseId!, cacheTtlMs: 1,
    })
    await expect(resolve([row.$id])).resolves.toEqual({})
    await expect(resolve([`t-hostres-byid-${stamp}`])).resolves
      .toMatchObject({ [`t-hostres-byid-${stamp}`]: `byid-${stamp}.test.local` })
  })

  it('eine ABUSE-Sperre ist nicht auflösbar — eine BILLING-Sperre schon', async () => {
    // Audit-Befund: die Sperre kam nach diesem Resolver, `status` war damals der
    // einzige Aus-Schalter. Ein abuse-gesperrter Host ist vollständig offline —
    // ein Mail-Link dorthin ist dieselbe 404-Sackgasse wie bei `disabled`.
    // Ein billing-gesperrter Host LEBT (nur-lesend): dorthin gehört der Link,
    // samt Hinweis, warum gerade nichts geht.
    const abuseTenant = `t-hostres-abuse-${stamp}`
    const billingTenant = `t-hostres-billing-${stamp}`
    await seed(`abuse-${stamp}.test.local`, abuseTenant, 'active', 'abuse')
    await seed(`billing-${stamp}.test.local`, billingTenant, 'active', 'billing')

    const resolve = createCommunityHostResolver({
      endpoint: endpoint!, projectId: projectId!, apiKey: apiKey!, databaseId: databaseId!, cacheTtlMs: 1,
    })
    const hosts = await resolve([abuseTenant, billingTenant])
    expect(hosts).not.toHaveProperty(abuseTenant)
    expect(hosts[billingTenant]).toBe(`billing-${stamp}.test.local`)
  })

  it('ohne gesetzte Sperre bleibt der Host auflösbar (NULL ist keine Sperre)', async () => {
    // Der Grund, warum im Code gefiltert wird und nicht per `Query.notEqual`:
    // `suspension` ist optional, und ein SQL-`!=` sortiert NULL gleich mit aus —
    // dieser Resolver fände dann für Bestandszeilen gar keinen Host mehr.
    const plainTenant = `t-hostres-plain-${stamp}`
    await tablesDB.createRow({
      databaseId: databaseId!, tableId: COMMUNITIES_TABLE, rowId: ID.unique(),
      // Bewusst OHNE `suspension` angelegt — wie jede Zeile aus der Zeit vor control-034.
      data: { host: `plain-${stamp}.test.local`, mode: 'pool', projectId: 'shared-project', tenantId: plainTenant, status: 'active' },
    }).then((row) => { createdIds.push(row.$id) })

    const resolve = createCommunityHostResolver({
      endpoint: endpoint!, projectId: projectId!, apiKey: apiKey!, databaseId: databaseId!, cacheTtlMs: 1,
    })
    await expect(resolve([plainTenant])).resolves.toMatchObject({ [plainTenant]: `plain-${stamp}.test.local` })
  })

  it('leere Eingabe fragt gar nicht erst', async () => {
    const resolve = createCommunityHostResolver({
      endpoint: 'http://127.0.0.1:1/v1', projectId: 'nope', apiKey: 'nope', databaseId: 'nope',
    })
    // Unerreichbarer Endpunkt: ohne Ids darf trotzdem nichts geworfen werden.
    await expect(resolve([])).resolves.toEqual({})
    await expect(resolve(['', ''])).resolves.toEqual({})
  })

  it('FAIL-SOFT: unerreichbares Control Plane → leere Karte statt Fehler', async () => {
    // Die Mail muss trotzdem rausgehen (mit App-Basis-Links) — ein geworfener
    // Fehler würde im Sweep den ganzen Empfänger überspringen.
    const resolve = createCommunityHostResolver({
      endpoint: 'http://127.0.0.1:1/v1', projectId: 'nope', apiKey: 'nope', databaseId: 'nope',
    })
    await expect(resolve(['t-egal'])).resolves.toEqual({})
  })
})

import { Client, ID, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createCommunityJoinDatesResolver,
  joinDateCacheKey,
  recentJoinsCacheKey,
} from '../server/utils/communityJoinDatesResolver'
import { COMMUNITY_MEMBERS_TABLE } from '../shared/types/communityMember'

/**
 * F1 — der Cross-Projekt-Leser hinter `registerCommunityJoinDatesResolver`.
 *
 * Zwei Teile, und der zweite ist env-gated wie bei `communityHostResolver`
 * daneben: die eine Frage, an der dieser Resolver still scheitern kann, ist,
 * ob er das RICHTIGE DATUM liest. `community_members` hat keine
 * Beitritts-Spalte — die Tatsache ist `$createdAt` der Zeile. Ein Fixture
 * könnte das nicht belegen, weil Appwrite dieses Feld selbst setzt; und weil
 * der Vertrag fail-soft ist, sähe ein falscher Zugriff exakt wie „kein
 * Mitglied" aus: das Abzeichen käme nie, ohne einen Fehler im Log.
 */

describe('die Cache-Schlüssel', () => {
  it('trennen Community, Projekt und Mensch', () => {
    // Dieselbe Community-Id in zwei Runtime-Projekten (Pool und Silo) ist
    // NICHT derselbe Mensch — ein zusammengeklebter Schlüssel wäre eine
    // stille Verwechslung über Projektgrenzen.
    expect(joinDateCacheKey('c1', 'pool', 'u1')).not.toBe(joinDateCacheKey('c1', 'silo', 'u1'))
    expect(joinDateCacheKey('c1', 'pool', 'u1')).not.toBe(joinDateCacheKey('c2', 'pool', 'u1'))
  })

  it('nehmen das Fenster in den Aggregat-Schlüssel auf', () => {
    // Ohne das Fenster im Schlüssel bekäme eine Frage nach 30 Tagen die
    // gecachte Antwort auf 7 Tage.
    expect(recentJoinsCacheKey('c1', 'pool', 7)).not.toBe(recentJoinsCacheKey('c1', 'pool', 30))
  })
})

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

describe.skipIf(!hasEnv)('createCommunityJoinDatesResolver (echte Appwrite)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  const createdIds: string[] = []
  const stamp = Date.now()
  const COMMUNITY = `c-join-${stamp}`
  const RUNTIME = `pool-join-${stamp}`

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: COMMUNITY_MEMBERS_TABLE, rowId: id }).catch(() => {})
    }
  })

  async function seed(runtimeUserId: string, status: 'active' | 'removed' | 'invited') {
    const row = await tablesDB.createRow({
      databaseId: databaseId!, tableId: COMMUNITY_MEMBERS_TABLE, rowId: ID.unique(),
      data: {
        communityId: COMMUNITY,
        runtimeProjectId: RUNTIME,
        runtimeUserId,
        role: 'viewer',
        status,
        email: `${runtimeUserId}@test.local`,
      },
    })
    createdIds.push(row.$id)
    return row
  }

  function resolver(cacheTtlMs = 1) {
    return createCommunityJoinDatesResolver({
      endpoint: endpoint!, projectId: projectId!, apiKey: apiKey!, databaseId: databaseId!, cacheTtlMs,
    })
  }

  it('liest das Beitrittsdatum aus $createdAt der Mitgliedschafts-Zeile', async () => {
    const row = await seed(`u-active-${stamp}`, 'active')

    const dates = await resolver().joinedAt({
      communityId: COMMUNITY, runtimeProjectId: RUNTIME, runtimeUserIds: [`u-active-${stamp}`],
    })

    expect(dates[`u-active-${stamp}`]).toBe(row.$createdAt)
  })

  it('nur Mitgliedschaften MIT Zugang zählen — Entfernte und Eingeladene nicht', async () => {
    // „1 Jahr Mitglied" ist Gegenwart: wem der Zugang entzogen wurde, der ist
    // nicht mehr dabei. Eine offene Einladung war nie ein Beitritt.
    await seed(`u-removed-${stamp}`, 'removed')
    await seed(`u-invited-${stamp}`, 'invited')

    const dates = await resolver().joinedAt({
      communityId: COMMUNITY,
      runtimeProjectId: RUNTIME,
      runtimeUserIds: [`u-removed-${stamp}`, `u-invited-${stamp}`, `u-fremd-${stamp}`],
    })

    // Nicht als leerer String, sondern GAR NICHT — der Aufrufer soll „nicht
    // dabei" nicht mit „Datum unbekannt" verwechseln können.
    expect(dates).toEqual({})
  })

  it('bündelt viele Ids in EINE Abfrage und cached (positiv wie negativ)', async () => {
    const a = await seed(`u-bundle-a-${stamp}`, 'active')
    await seed(`u-bundle-b-${stamp}`, 'active')

    const resolve = resolver(60_000)
    const dates = await resolve.joinedAt({
      communityId: COMMUNITY,
      runtimeProjectId: RUNTIME,
      runtimeUserIds: [`u-bundle-a-${stamp}`, `u-bundle-b-${stamp}`, `u-bundle-weg-${stamp}`],
    })
    expect(dates[`u-bundle-a-${stamp}`]).toBe(a.$createdAt)
    expect(dates[`u-bundle-b-${stamp}`]).toBeTruthy()

    // Negativ gecacht: eine erst danach angelegte Mitgliedschaft bleibt
    // innerhalb der TTL unbekannt. Ohne das fragt jeder Gast erneut nach.
    await seed(`u-bundle-weg-${stamp}`, 'active')
    const zweiterVersuch = await resolve.joinedAt({
      communityId: COMMUNITY, runtimeProjectId: RUNTIME, runtimeUserIds: [`u-bundle-weg-${stamp}`],
    })
    expect(zweiterVersuch).toEqual({})
  })

  it('zählt die Beitritte eines Fensters — und nur die mit Zugang', async () => {
    const eigene = `c-count-${stamp}`
    for (const [id, status] of [['a', 'active'], ['b', 'active'], ['c', 'removed']] as const) {
      const row = await tablesDB.createRow({
        databaseId: databaseId!, tableId: COMMUNITY_MEMBERS_TABLE, rowId: ID.unique(),
        data: {
          communityId: eigene, runtimeProjectId: RUNTIME, runtimeUserId: `u-count-${id}-${stamp}`,
          role: 'viewer', status, email: `${id}@test.local`,
        },
      })
      createdIds.push(row.$id)
    }

    const resolve = resolver()
    await expect(resolve.recentJoinCount({ communityId: eigene, runtimeProjectId: RUNTIME, days: 7 })).resolves.toBe(2)
    // Die Gegenprobe: ein Fenster, in dem gerade angelegte Zeilen NICHT liegen,
    // gibt es nicht — deshalb wird hier stattdessen eine fremde Community
    // gefragt, für die es echte 0 gibt.
    await expect(resolve.recentJoinCount({
      communityId: `c-leer-${stamp}`, runtimeProjectId: RUNTIME, days: 7,
    })).resolves.toBe(0)
  })

  it('leere Eingabe fragt gar nicht erst', async () => {
    const resolve = createCommunityJoinDatesResolver({
      endpoint: 'http://127.0.0.1:1/v1', projectId: 'nope', apiKey: 'nope', databaseId: 'nope',
    })
    await expect(resolve.joinedAt({ communityId: '', runtimeProjectId: '', runtimeUserIds: ['u1'] })).resolves.toEqual({})
    await expect(resolve.joinedAt({ communityId: 'c', runtimeProjectId: 'p', runtimeUserIds: [] })).resolves.toEqual({})
    await expect(resolve.recentJoinCount({ communityId: 'c', runtimeProjectId: 'p', days: 0 })).resolves.toBeNull()
  })

  it('FAIL-SOFT: unerreichbares Control Plane → leere Karte bzw. null', async () => {
    const resolve = createCommunityJoinDatesResolver({
      endpoint: 'http://127.0.0.1:1/v1', projectId: 'nope', apiKey: 'nope', databaseId: 'nope',
    })
    await expect(resolve.joinedAt({ communityId: 'c', runtimeProjectId: 'p', runtimeUserIds: ['u1'] })).resolves.toEqual({})
    await expect(resolve.recentJoinCount({ communityId: 'c', runtimeProjectId: 'p', days: 7 })).resolves.toBeNull()
  })
})

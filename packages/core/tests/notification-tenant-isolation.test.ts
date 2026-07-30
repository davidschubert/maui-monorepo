import { Client, ID, Permission, Query, Role, TablesDB } from 'node-appwrite'
import { afterAll, describe, expect, it } from 'vitest'
import {
  NOTIFICATION_SCOPE_ACCOUNT,
  notificationScopeValue,
  visibleNotificationScopes,
  type NotificationAudience,
} from '../shared/notificationScope'

/**
 * ISOLATIONSBEWEIS der Glocke gegen eine ECHTE Appwrite-Instanz (C15 / Audit
 * S6) — Muster: packages/comments/tests/tenant-isolation.test.ts.
 *
 * Der Fall, der den Befund ausgelöst hat: EIN Nutzer, ZWEI Communities. Vorher
 * sah er auf beiden Hosts alles gemischt (Row-Security trennt nach Empfänger,
 * nicht nach Community). Bewiesen wird deshalb dreierlei in einer Bewegung:
 *  1. jede Glocke zeigt nur ihre eigenen Meldungen,
 *  2. kontobezogene Meldungen (`_account`) erscheinen NICHT in einer Community,
 *     sondern nur im Kundenbereich,
 *  3. BESTANDSZEILEN ohne Stempel bleiben in BEIDEN sichtbar (fail-open,
 *     Davids Entscheidung 2 — kein Backfill, keine leere Glocke beim Deploy).
 *
 * Env-gated wie der comments-Beweis: ohne Appwrite-Env skippt die Suite.
 * Lokal: `set -a; source apps/comments/.env` — in CI liefert e2e.yml die
 * Instanz. Braucht system-022 auf der Instanz (sonst fehlt die Spalte).
 */
const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_KEY
const hasEnv = !!(endpoint && projectId && databaseId && apiKey)

const TABLE = 'notifications'
const STAMP = Date.now()
/** DERSELBE Empfänger in beiden Communities — genau der Befund-Fall. */
const RECIPIENT = `notif-iso-user-${STAMP}`
const TENANT_A = `t-notif-a-${STAMP}`
const TENANT_B = `t-notif-b-${STAMP}`

const COMMUNITY_A: NotificationAudience = { kind: 'tenant', tenantId: TENANT_A }
const COMMUNITY_B: NotificationAudience = { kind: 'tenant', tenantId: TENANT_B }
const ACCOUNT_AREA: NotificationAudience = { kind: 'account' }
const SILO: NotificationAudience = { kind: 'all' }

describe.skipIf(!hasEnv)('Glocken-Isolationsbeweis (echte Appwrite, notifications.tenantId)', () => {
  const tablesDB = hasEnv
    ? new TablesDB(new Client().setEndpoint(endpoint!).setProject(projectId!).setKey(apiKey!))
    : null!
  const createdIds: string[] = []

  /** Legt eine Notification an — `tenantId: null` simuliert eine
   *  BESTANDSZEILE (Spalten-Default '', wie vor system-022). */
  async function createNotification(tenantId: string | null, title: string): Promise<string> {
    const row = await tablesDB.createRow({
      databaseId: databaseId!,
      tableId: TABLE,
      rowId: ID.unique(),
      data: {
        recipientId: RECIPIENT,
        type: 'reply',
        title,
        body: 'Isolationstest',
        link: '/',
        read: false,
        ...(tenantId === null ? {} : { tenantId }),
      },
      permissions: [
        Permission.read(Role.user(RECIPIENT)),
        Permission.update(Role.user(RECIPIENT)),
      ],
    })
    createdIds.push(row.$id)
    return row.$id
  }

  /** Die Glocke DIESES Hosts — exakt die Abfrage der Leseroute. */
  async function bell(audience: NotificationAudience): Promise<string[]> {
    const allowed = visibleNotificationScopes(audience)
    const { rows } = await tablesDB.listRows({
      databaseId: databaseId!,
      tableId: TABLE,
      queries: [
        Query.equal('recipientId', RECIPIENT),
        ...(allowed ? [Query.equal('tenantId', allowed)] : []),
        Query.limit(100),
      ],
    })
    return rows.map(row => row.$id)
  }

  afterAll(async () => {
    for (const id of createdIds) {
      await tablesDB.deleteRow({ databaseId: databaseId!, tableId: TABLE, rowId: id }).catch(() => {})
    }
  })

  it('ein Nutzer, zwei Communities: jede Glocke zeigt nur ihre eigenen Meldungen', async () => {
    const idA = await createNotification(TENANT_A, 'Antwort in Community A')
    const idB = await createNotification(TENANT_B, 'Antwort in Community B')

    const inA = await bell(COMMUNITY_A)
    const inB = await bell(COMMUNITY_B)

    expect(inA).toContain(idA)
    expect(inA).not.toContain(idB)
    expect(inB).toContain(idB)
    expect(inB).not.toContain(idA)
  })

  it('kontobezogene Meldungen NUR im Kundenbereich, nie in einer Community', async () => {
    const idAccount = await createNotification(
      notificationScopeValue('account', TENANT_A),
      'Zahlung fehlgeschlagen',
    )
    expect(idAccount).toBeTruthy()

    expect(await bell(ACCOUNT_AREA)).toContain(idAccount)
    expect(await bell(COMMUNITY_A)).not.toContain(idAccount)
    expect(await bell(COMMUNITY_B)).not.toContain(idAccount)
  })

  it('BESTANDSZEILEN ohne Stempel bleiben in BEIDEN Glocken sichtbar (fail-open)', async () => {
    const idLegacy = await createNotification(null, 'Alte Meldung ohne Stempel')

    expect(await bell(COMMUNITY_A)).toContain(idLegacy)
    expect(await bell(COMMUNITY_B)).toContain(idLegacy)
    expect(await bell(ACCOUNT_AREA)).toContain(idLegacy)
  })

  it('Silo bleibt ungefiltert — sieht alles (heutiges Verhalten)', async () => {
    const all = await bell(SILO)
    expect(all.length).toBe(createdIds.length)
    for (const id of createdIds) expect(all).toContain(id)
  })

  it('der Spalten-Default macht aus einer Bestandszeile wirklich \'\' — nicht null', async () => {
    // Trägt die Annahme, auf der der Fail-open-Filter steht: Query.equal(…, '')
    // muss Bestandszeilen treffen. Wäre der Wert null, wäre die Glocke leer.
    const idLegacy = await createNotification(null, 'Default-Prüfung')
    const row = await tablesDB.getRow({ databaseId: databaseId!, tableId: TABLE, rowId: idLegacy })
    expect((row as unknown as { tenantId?: unknown }).tenantId).toBe('')
    expect(NOTIFICATION_SCOPE_ACCOUNT).not.toBe('')
  })
})

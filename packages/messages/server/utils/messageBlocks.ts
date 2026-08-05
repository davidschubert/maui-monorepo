import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { blockAppliesIn, isSelfBlock, pairIsBlocked, type BlockFacts } from '../../shared/messageBlocks'
import { MESSAGE_BLOCKS_TABLE, type BlockScope, type MessageBlock } from '../../shared/types/message'

/**
 * SPERREN — der Datenzugriff (Konzept § 2.3, Davids Entscheidung 3).
 *
 * ═══ DIE EINE STELLE, DIE BEWUSST NICHT DURCH DIE DATENTÜR GEHT ═══════════
 *
 * `pairBlockRows()` fragt Appwrite OHNE Mandanten-Filter. Das ist kein
 * vergessener Scope, sondern die Umsetzung von Davids Entscheidung 3: das
 * Häkchen „auch in meinen anderen Communities sperren" ist per Definition
 * mandantenübergreifend — dieselbe Kategorie wie die GDPR-Orchestrierung und
 * die Sweeps, die CLAUDE.md ausdrücklich außerhalb der Tür erlaubt.
 *
 * WARUM ES ANDERS NICHT GEHT, und zwar geprüft:
 *  - Eine Zeile JE Community zu schreiben („materialisieren") verlangt die
 *    Liste der Communities des Sperrenden. Die steht in `community_members`
 *    im CONTROL-Projekt, für das das Runtime-Projekt keinen Schlüssel hat
 *    (dieselbe Grenze wie bei `revokeCommunityLabel`, A5). Und selbst mit ihr
 *    bliebe die Lücke: eine Community, der die Person MORGEN beitritt, bekäme
 *    keine Zeile — genau dort, wo die Sperre am nötigsten wäre.
 *  - Die Reichweite in den Appwrite-Account-`prefs` abzulegen (die Alternative
 *    aus Konzept § 8) scheitert an der BEIDSEITIGKEIT: B müsste lesen, dass A
 *    ihn gesperrt hat, und fremde `prefs` kann niemand lesen.
 *
 * WAS DIESE ABFRAGE NICHT KANN, und deshalb ist sie vertretbar: sie ist auf
 * GENAU ZWEI User-Ids festgenagelt, von denen eine der Anfragende selbst ist.
 * Sie kann über keinen dritten Menschen etwas aussagen und über keine dritte
 * Community — sie beantwortet ausschließlich „dürfen wir zwei miteinander
 * reden". Bewiesen wird das in `scripts/verify-messages.mjs`.
 *
 * Alles ANDERE in dieser Datei (anlegen, aufheben, auflisten) läuft
 * selbstverständlich durch die Tür.
 */

/**
 * Der Mandanten-WERT dieses Requests — genau der, den die Datentür in die
 * Zeilen stempelt (`scopeRowFor`): im Pool `tenant.tenantId`, im Silo und im
 * Einzelbetrieb ''. Ein Silo-Kontext hat gar kein Feld dafür, deshalb die
 * Fallunterscheidung statt eines optionalen Zugriffs.
 */
function currentCommunityId(event: H3Event): string {
  const tenant = useTenant(event)
  return tenant?.mode === 'pool' ? tenant.tenantId : ''
}

/** Klinke wie bei den übrigen Tabellen ohne User-Rechte: Admin-Client. */
function blockDb(event: H3Event) {
  return tenantDb(event, { as: 'operator', actor: 'operator' })
}

/** Zeile → das, womit die pure Regel rechnet. */
function toFacts(row: MessageBlock): BlockFacts {
  return {
    communityId: row.communityId ?? '',
    blockerId: row.blockerId,
    blockedId: row.blockedId,
    scope: (row.scope === 'everywhere' ? 'everywhere' : 'community') as BlockScope,
  }
}

/**
 * ALLE Sperr-Zeilen zu genau diesem Paar — über Community-Grenzen hinweg.
 *
 * EINE Abfrage für beide Richtungen (§ 2.3): `blockerId ∈ {a,b}` UND
 * `blockedId ∈ {a,b}`. Das liefert höchstens vier Kombinationen, von denen die
 * Selbst-Paare ohnehin nie geschrieben werden.
 *
 * Siehe den Dateikopf für die Begründung des fehlenden Mandanten-Filters.
 * `Query.limit` ist explizit (Projektregel) und großzügig: mehr als eine
 * Handvoll Zeilen kann es zu einem Paar gar nicht geben (Unique-Index je
 * Community).
 */
export async function pairBlockRows(event: H3Event, a: string, b: string): Promise<BlockFacts[]> {
  if (isSelfBlock(a, b)) return []
  const config = useRuntimeConfig(event)
  // Admin-Client mit Absicht (s. Kopf) — und in `server/utils`, nicht in
  // `server/api`: der ESLint-Backstop gegen rohes `tablesDB` zieht dort seine
  // Grenze, weil eine ROUTE nie an der Tür vorbei darf. Diese Funktion ist
  // kein Request-Handler, sondern die eine mandantenübergreifende Frage.
  const { tablesDB } = createAdminClient(event)
  const { rows } = await tablesDB.listRows<MessageBlock>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: MESSAGE_BLOCKS_TABLE,
    queries: [
      Query.equal('blockerId', [a, b]),
      Query.equal('blockedId', [a, b]),
      Query.limit(50),
    ],
  })
  return rows.map(toFacts)
}

/**
 * Darf zwischen diesen beiden IN DIESER Community geschrieben werden?
 *
 * FAIL-CLOSED: scheitert die Abfrage, gilt „gesperrt". Eine Sperre, die wegen
 * einer klemmenden Verbindung nicht wirkt, ist genau der Fall, für den sie
 * gebaut wurde — und die Kosten des Irrtums sind eine abgelehnte Nachricht,
 * nicht eine durchgelassene Belästigung.
 */
export async function pairBlocked(event: H3Event, a: string, b: string): Promise<boolean> {
  const communityId = currentCommunityId(event)
  try {
    return pairIsBlocked(await pairBlockRows(event, a, b), a, b, communityId)
  }
  catch (error) {
    logEvent('warn', 'messages.block_lookup_failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return true
  }
}

/**
 * Meine Sperren in DIESER Community — für die Verwaltungs-Liste.
 *
 * Gelesen wird GESCOPT (Datentür) — eine `everywhere`-Zeile aus einer ANDEREN
 * Community wirkt hier zwar, taucht in dieser Liste aber nicht auf. Das ist
 * bewusst: die Liste zeigt, was HIER ausgesprochen wurde; das Häkchen
 * „überall" gehört zu der Zeile, an der es gesetzt wurde, und wird dort auch
 * wieder aufgehoben. Sonst hätte man eine Aufhebung an einer Stelle, deren
 * Wirkung man an einer anderen sucht.
 */
export async function listMyBlocks(event: H3Event, userId: string): Promise<MessageBlock[]> {
  const { rows } = await blockDb(event).list<MessageBlock>(MESSAGE_BLOCKS_TABLE, [
    Query.equal('blockerId', userId),
    Query.orderDesc('$createdAt'),
    Query.limit(100),
  ])
  return rows
}

/**
 * Sperren. Idempotent: der zweite Klick ist ein 409 und damit ein No-op —
 * dieselbe Mechanik wie bei den Zähler-Zeilen (blind schreiben, 409 lesen).
 *
 * Wechselt jemand die Reichweite (erst „hier", dann „überall"), wird die
 * bestehende Zeile GEÄNDERT statt eine zweite geschrieben: der Unique-Index
 * ließe die zweite ohnehin nicht zu, und zwei Wahrheiten über dieselbe Sperre
 * wären der Anfang vom Ende der Nachvollziehbarkeit.
 */
export async function blockUser(
  event: H3Event,
  blockerId: string,
  blockedId: string,
  everywhere: boolean,
): Promise<void> {
  if (isSelfBlock(blockerId, blockedId)) return
  const scope: BlockScope = everywhere ? 'everywhere' : 'community'
  const db = blockDb(event)

  const existing = await db.find<MessageBlock>(MESSAGE_BLOCKS_TABLE, [
    Query.equal('blockerId', blockerId),
    Query.equal('blockedId', blockedId),
  ])

  if (existing) {
    if (existing.scope !== scope) {
      await db.update(MESSAGE_BLOCKS_TABLE, existing.$id, { scope }, 'Block not found')
    }
    return
  }

  // Keine Row-Permissions (siehe Migration): eine Sperre hat keinen Leser im
  // Client, und ein Realtime-Ereignis darüber wäre genau die Auskunft, die
  // § 2.3 ausschließt („Der Blockierte erfährt es nicht").
  await db.create(MESSAGE_BLOCKS_TABLE, { blockerId, blockedId, scope }, { permissions: [] })
}

/** Aufheben. Fremde Zeilen sind für den Aufrufer schlicht nicht vorhanden. */
export async function unblockUser(event: H3Event, blockerId: string, blockedId: string): Promise<boolean> {
  const db = blockDb(event)
  const existing = await db.find<MessageBlock>(MESSAGE_BLOCKS_TABLE, [
    Query.equal('blockerId', blockerId),
    Query.equal('blockedId', blockedId),
  ])
  if (!existing) return false

  const communityId = currentCommunityId(event)
  // Eine `everywhere`-Zeile aus einer FREMDEN Community wirkt hier zwar,
  // gehört aber dort hin — sie hier aufzuheben, hieße sie dort aufzuheben,
  // ohne dass es jemand sieht.
  if (!blockAppliesIn(toFacts(existing), communityId)) return false

  await db.remove(MESSAGE_BLOCKS_TABLE, existing.$id, 'Block not found')
  return true
}

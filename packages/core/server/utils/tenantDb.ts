import { ID, Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { rowBelongsToTenant, scopeQuery, scopeRowFor, useTenant } from './tenant'
import { tenantRowPermissions, type TenantRowPermissionOptions } from './tenantRowPermissions'

/**
 * DIE mandantensichere Datentür (Horizont-3, Ablösung der Konvention).
 *
 * WARUM SIE EXISTIERT: Isolation hing bis hierher an Disziplin — jede Route
 * musste `scopeQuery` rufen, `scopeRow` setzen und beim Zugriff per ID die
 * Zugehörigkeit prüfen. Drei Dinge, die man vergessen kann, und am 2026-07-26
 * ist genau das passiert (drei Moderations-Routen lasen fremde Zeilen per ID).
 * Eine Regel, an die sich alle erinnern müssen, ist keine Regel.
 *
 * DIE EIGENSCHAFT, DIE ZÄHLT: durch diese Tür gibt es keinen ungescopten Weg.
 * `list` hängt den Filter immer an, `get`/`update`/`remove` prüfen die
 * Zugehörigkeit VOR der Aktion, `create` stempelt Mandant und Row-Permissions
 * immer. Produkt-Code kann die Grenze nicht mehr vergessen, weil er sie nicht
 * mehr selbst zieht.
 *
 * ZWEI TÜRKLINKEN, EINE TÜR:
 *  - `as: 'member'` (Default) → Session-Client. Appwrite prüft zusätzlich die
 *    Row-Permissions; der Filter ist das Netz darunter.
 *  - `as: 'operator'` → Admin-Client, für Moderation/Betreiber-Sicht. Der
 *    umgeht die Row-Permissions ABSICHTLICH — hier ist die Prüfung dieser Tür
 *    die EINZIGE Grenze, deshalb ist sie nicht optional.
 *
 * NICHT durch die Tür gehen (bewusst): Migrationen, Sweeps, GDPR-Orchestrierung
 * und alles, was per Definition über Mandanten hinweg arbeitet. Diese Stellen
 * liegen außerhalb von `server/api/**` und sind dort auch nur erlaubt.
 */

/**
 * Die `data`-Typen, die das SDK erwartet. Anlegen verlangt die Felder
 * VOLLSTÄNDIG, Ändern nur teilweise — deshalb zwei Aliase statt einem.
 */
type RowDataCreate<T extends Models.Row> = T extends Models.DefaultRow
  ? Partial<Models.Row> & Record<string, unknown>
  : Partial<Models.Row> & Omit<T, keyof Models.Row>
type RowDataUpdate<T extends Models.Row> = T extends Models.DefaultRow
  ? Partial<Models.Row> & Record<string, unknown>
  : Partial<Models.Row> & Partial<Omit<T, keyof Models.Row>>

export type TenantDbActor = 'member' | 'operator'

export interface TenantDbOptions {
  /** Wer zugreift. Default 'member' (Session-Client). */
  as?: TenantDbActor
}

export interface TenantCreateOptions extends TenantRowPermissionOptions {
  /** Eigene Row-ID; sonst ID.unique(). */
  rowId?: string
  /** Vollständig eigene Permissions (überschreibt read/ownerUserId/extraRead).
   *  NUR für Sonderfälle — die Regel ist das Publikum via `read`. */
  permissions?: string[]
}

/**
 * PURE (unit-getestet): `tenantId` aus Aufrufer-Daten entfernen.
 *
 * Der Mandant wird von der Tür gesetzt, NIE vom Aufrufer. Sonst könnte ein
 * Aufrufer (oder ein durchgereichter Request-Body) eine Zeile in einen fremden
 * Mandanten schreiben oder eine bestehende dorthin verschieben — ein Leck, das
 * wie ein Tippfehler aussieht.
 */
export function stripTenantKey<T extends Record<string, unknown>>(data: T): T {
  if (!('tenantId' in data) && !('communityId' in data)) return data
  // E8-3: BEIDE Schlüssel entfernen — communityId ist die neue Spalte,
  // tenantId der Übergangs-Stempel; keiner darf vom Aufrufer kommen.
  const { tenantId: _ignored, communityId: _ignored2, ...rest } = data
  return rest as unknown as T
}

export function tenantDb(event: H3Event, options: TenantDbOptions = {}) {
  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const actor: TenantDbActor = options.as ?? 'member'
  const tenant = useTenant(event)

  // Die Client-Wahl ist der EINZIGE Unterschied zwischen den Türklinken.
  const tablesDB = actor === 'operator'
    ? createAdminClient(event).tablesDB
    : createSessionClient(event).tablesDB

  /** Zeile per ID holen UND ihre Zugehörigkeit belegen. 404 statt 403: ein 403
   *  würde bestätigen, dass die ID existiert. */
  async function get<T extends Models.Row>(tableId: string, rowId: string, notFound = 'Not found'): Promise<T> {
    const row = await tablesDB.getRow<T>({ databaseId, tableId, rowId })
      .catch((error: unknown) => { throw toH3Error(error, notFound) })
    if (!rowBelongsToTenant(tenant, row)) {
      throw createError({ status: 404, statusText: notFound })
    }
    return row
  }

  return {
    /** Der Mandant dieses Requests (null im Single-Tenant-Betrieb). */
    tenant,
    /** Datenbank-Id — für die seltenen Fälle, in denen eine Route sie braucht. */
    databaseId,

    get,

    /** Liste — der Mandanten-Filter wird IMMER angehängt. */
    async list<T extends Models.Row>(tableId: string, queries: string[] = []) {
      return tablesDB.listRows<T>({ databaseId, tableId, queries: scopeQuery(event, queries) })
    },

    /** Erste passende Zeile oder null (gescopt). Ersetzt das Muster
     *  „listRows mit limit(1) und dann rows[0]". */
    async find<T extends Models.Row>(tableId: string, queries: string[] = []): Promise<T | null> {
      const { rows } = await tablesDB.listRows<T>({
        databaseId, tableId, queries: scopeQuery(event, [...queries, Query.limit(1)]),
      })
      return rows[0] ?? null
    },

    /** Anzahl (gescopt) — ohne die Zeilen zu übertragen. */
    async count(tableId: string, queries: string[] = []): Promise<number> {
      const { total } = await tablesDB.listRows({
        databaseId, tableId, queries: scopeQuery(event, [...queries, Query.limit(1)]),
      })
      return total
    },

    /** Anlegen — Mandant und Row-Permissions setzt die Tür. */
    async create<T extends Models.Row>(
      tableId: string,
      data: Record<string, unknown>,
      createOptions: TenantCreateOptions = {},
    ): Promise<T> {
      const { rowId, permissions, ...permissionOptions } = createOptions

      /**
       * MITMACHEN IST BEITRETEN (A5, Davids Entscheidung 1 vom 2026-07-29).
       *
       * Warum der Auslöser HIER steht und nicht in den zwanzig Schreib-Routen:
       * genau das ist der Grund, aus dem diese Tür existiert. „Jede Route muss
       * daran denken" hat sich am 2026-07-26 schon einmal als keine Regel
       * erwiesen; eine vergessene Aufrufstelle wäre hier kein Leck, aber ein
       * Mensch, der schreibt und trotzdem kein Mitglied wird — unsichtbar, bis
       * es jemandem auffällt. Durch diese Tür geht JEDER eigene Schreibvorgang
       * eines Mandanten-Layers, also ist sie die vollständige Liste.
       *
       * NUR die Türklinke 'member': `as: 'operator'` ist Moderation und
       * Betreiber-Sicht (auch recordActivity läuft so) — dort handelt nicht die
       * Person, um deren Mitgliedschaft es geht.
       *
       * VOR dem Anlegen, nicht danach: das frische Label soll schon gelten, wenn
       * Appwrite die Row-Permissions dieser Zeile auswertet — sonst könnte der
       * Autor seinen eigenen Beitrag im nächsten Listenaufruf nicht lesen.
       *
       * Wirft nie und blockiert nie: joinSite() schluckt jeden Fehler
       * ('unavailable'). Ein Beitritt darf keinen Kommentar kosten.
       */
      if (actor === 'member') await joinSite(event, 'contribution')

      return tablesDB.createRow<T>({
        databaseId,
        tableId,
        rowId: rowId ?? ID.unique(),
        // Der EINE Cast der Tür: die SDK-Typen binden `data` an den
        // Row-Generic (bedingter Typ), diese Tür nimmt bewusst lockere Daten —
        // jeder Layer hat andere Felder. Ein Cast HIER ersetzt einen Cast an
        // jeder Aufrufstelle; und genau an Aufrufstellen wäre er die Stelle,
        // an der später jemand die Prüfung mit wegcastet.
        data: scopeRowFor(tenant, stripTenantKey(data)) as RowDataCreate<T>,
        permissions: permissions ?? tenantRowPermissions(event, permissionOptions),
      })
    },

    /** Ändern — erst Zugehörigkeit belegen, dann schreiben. Der Mandant einer
     *  bestehenden Zeile lässt sich nicht umbiegen (stripTenantKey). */
    async update<T extends Models.Row>(
      tableId: string,
      rowId: string,
      data: Record<string, unknown>,
      notFound = 'Not found',
    ): Promise<T> {
      await get(tableId, rowId, notFound)
      return tablesDB.updateRow<T>({
        databaseId, tableId, rowId, data: stripTenantKey(data) as RowDataUpdate<T>,
      })
    },

    /**
     * NUR die Row-Permissions ändern (keine Datenfelder) — erst Zugehörigkeit
     * belegen. Braucht z. B. das Ausblenden: dort wird in einem zweiten Schritt
     * die read(any)-Permission entzogen, nachdem das Status-Event schon
     * ausgeliefert ist.
     */
    async updatePermissions<T extends Models.Row>(
      tableId: string,
      rowId: string,
      permissions: string[],
      notFound = 'Not found',
    ): Promise<T> {
      await get(tableId, rowId, notFound)
      return tablesDB.updateRow<T>({ databaseId, tableId, rowId, permissions })
    },

    /**
     * Atomarer Zähler-Schritt nach oben — erst Zugehörigkeit belegen, dann
     * increment. `max` deckelt hart (Appwrite wirft beim Überschreiten) —
     * das ist z. B. das überbuchungssichere Kapazitäts-Gate der Event-RSVPs.
     */
    async increment<T extends Models.Row>(
      tableId: string,
      rowId: string,
      column: string,
      options: { value?: number, max?: number } = {},
      notFound = 'Not found',
    ): Promise<T> {
      await get(tableId, rowId, notFound)
      return tablesDB.incrementRowColumn({
        databaseId, tableId, rowId, column,
        value: options.value ?? 1,
        ...(options.max !== undefined ? { max: options.max } : {}),
      }) as Promise<T>
    },

    /** Atomarer Zähler-Schritt nach unten — erst Zugehörigkeit belegen. */
    async decrement<T extends Models.Row>(
      tableId: string,
      rowId: string,
      column: string,
      options: { value?: number, min?: number } = {},
      notFound = 'Not found',
    ): Promise<T> {
      await get(tableId, rowId, notFound)
      return tablesDB.decrementRowColumn({
        databaseId, tableId, rowId, column,
        value: options.value ?? 1,
        ...(options.min !== undefined ? { min: options.min } : {}),
      }) as Promise<T>
    },

    /** Löschen — erst Zugehörigkeit belegen. */
    async remove(tableId: string, rowId: string, notFound = 'Not found'): Promise<void> {
      await get(tableId, rowId, notFound)
      await tablesDB.deleteRow({ databaseId, tableId, rowId })
    },
  }
}

export type TenantDb = ReturnType<typeof tenantDb>

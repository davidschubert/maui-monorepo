import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * H3-4.3 Quota-Enforcement (Blueprint S4): ein Pool-Kunde darf den geteilten
 * Server nicht erschöpfen. Core stellt den GENERISCHEN Baustein — welche
 * Tabelle ein Produkt drosselt, sagt der PRODUKT-Layer selbst beim Aufruf
 * (kein core→Produkt-Coupling, A14):
 *
 *   await assertPoolWriteQuota(event, { kind: 'comments', tableId: COMMENTS_TABLE })
 *
 * Limits kommen aus app.config pukalani.tenancy.quota (Core-Default AUS; die
 * Platform-App aktiviert und staffelt sie PRO PLAN):
 *
 *   pukalani: { tenancy: { quota: { enabled: true, plans: {
 *     basic:    { comments: { perDay: 200,  total: 5_000 } },
 *     personal: { comments: { perDay: 1000, total: 50_000 } },
 *     pro:      { comments: { perDay: 5000, total: 250_000 } },
 *   } } } }
 *
 * FEHLT die Zeile für ein `kind`, ist der Aufruf ein NO-OP — kein Fehler,
 * keine Warnung, kein Log. Genau so waren `events` und `media` bis zum
 * 2026-08-02 gebremst-auf-dem-Papier (F27/F40): der Haken stand an der Route,
 * der Katalog schwieg. Wer einen neuen Haken setzt, setzt die Zahlen mit.
 *
 * Der Plan des Tenants (TenantContext.plan, Default 'free') wählt die Zeile;
 * unbekannter Plan → 'free'. Semantik: greift NUR für Pool-Tenants (Silo =
 * eigenes Projekt, erschöpft niemanden mit). perDay = rollierende 24 h (kein
 * Mitternachts-Reset-Gaming), total = Bestand gesamt; 0/fehlend = unbegrenzt.
 * Kosten: zwei indizierte Count-Queries pro Write (idx_tenant) → 429 bei
 * Überschreitung.
 */

export interface TenantQuotaLimits {
  /** Schreibzugriffe in den letzten 24 h (rollierend); 0/fehlend = unbegrenzt. */
  perDay?: number
  /** Bestand gesamt; 0/fehlend = unbegrenzt. */
  total?: number
}

interface TenancyQuotaConfig {
  enabled?: boolean
  /** Limits je Plan-Key (basic/personal/pro): { [plan]: { [kind]: Limits } } —
   *  aufsteigend sortiert, der erste Key ist der Fallback. */
  plans?: Record<string, Record<string, TenantQuotaLimits | undefined> | undefined>
}

/** PURE Entscheidung (unit-getestet): welches Limit ist verletzt? */
export function evaluateQuota(
  counts: { day: number, total: number },
  limits: TenantQuotaLimits,
): 'ok' | 'total' | 'perDay' {
  if (limits.total && counts.total >= limits.total) return 'total'
  if (limits.perDay && counts.day >= limits.perDay) return 'perDay'
  return 'ok'
}

/** PURE Auflösung (unit-getestet): Limits für Plan+kind. Unbekannter/
 *  fehlender Plan → ERSTER Katalog-Eintrag (Konvention: der Katalog ist
 *  aufsteigend sortiert, der erste Key ist der niedrigste Plan). Core
 *  bleibt damit plan-name-agnostisch — vor dem Rename hing hier ein
 *  hartes 'free'. */
export function limitsForPlan(
  plans: TenancyQuotaConfig['plans'],
  plan: string | undefined,
  kind: string,
): TenantQuotaLimits | undefined {
  if (!plans) return undefined
  const fallbackKey = Object.keys(plans)[0]
  const forPlan = (plan ? plans[plan] : undefined) ?? (fallbackKey ? plans[fallbackKey] : undefined)
  return forPlan?.[kind]
}

/**
 * DAS GELTENDE KONTINGENT eines Postens für den Mandanten DIESES Requests —
 * die EINE Auflösung, aus der sowohl die Bremse als auch die Anzeige lesen.
 *
 * Sie war bis F51 (2026-08-07) eine Zeile in `assertPoolWriteQuota`. Dann kam
 * der Reiter „Speicher" (`/api/community/usage`) dazu, der dieselbe Frage
 * stellt — und zwei Fassungen derselben Fallback-Kette wären genau die Sorte
 * Doppelpflege, die still auseinanderläuft: der Kunde läse „12 von 5.000",
 * während die Bremse bei 200 zumacht.
 *
 * Die Kette selbst ist unverändert: die vom Resolver aufgelösten Katalog-Limits
 * (`community_plans`, im Control Plane OHNE Deploy editierbar) schlagen den
 * statischen app.config-Katalog. `undefined` heißt „kein Kontingent" — kein
 * Pool-Mandant, Quota aus, oder für diesen Posten sind keine Zahlen hinterlegt.
 */
export function tenantLimitsFor(event: H3Event, kind: string): TenantQuotaLimits | undefined {
  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') return undefined

  const appConfig = useAppConfig() as { pukalani?: { tenancy?: { quota?: TenancyQuotaConfig } } }
  const quota = appConfig.pukalani?.tenancy?.quota
  if (quota?.enabled !== true) return undefined

  return tenant.limits?.[kind] ?? limitsForPlan(quota.plans, tenant.plan, kind)
}

export async function assertPoolWriteQuota(event: H3Event, options: { kind: string, tableId: string }): Promise<void> {
  const tenant = useTenant(event)
  if (tenant?.mode !== 'pool') return

  const limits = tenantLimitsFor(event, options.kind)
  if (!limits) return

  const config = useRuntimeConfig(event)
  const { tablesDB } = createAdminClient(event)
  // E8-3: die Spalte heißt communityId (Backfill lief vor diesem Code).
  const tenantFilter = Query.equal('communityId', tenant.tenantId)
  const countQuery = (extra: string[] = []) => tablesDB.listRows({
    databaseId: config.public.appwriteDatabaseId,
    tableId: options.tableId,
    queries: [tenantFilter, ...extra, Query.limit(1)],
  }).then(r => r.total)

  const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [total, day] = await Promise.all([
    limits.total ? countQuery() : Promise.resolve(0),
    limits.perDay ? countQuery([Query.greaterThanEqual('$createdAt', dayStart)]) : Promise.resolve(0),
  ])

  const verdict = evaluateQuota({ day, total }, limits)
  if (verdict !== 'ok') {
    // 429 wie beim Rate-Limit; keine internen Zahlen an den Client leaken.
    //
    // Der FACHLICHE Grund reist als `data.code` mit (Konvention seit
    // 2026-07-29, core/server/error.ts hebt genau diesen Schlüssel als
    // `reason` ins Envelope). Ohne ihn ist ein erschöpftes Kontingent für
    // eine Oberfläche NICHT von einem Rate-Limit zu unterscheiden — beides
    // ist 429 — und der Owner liest „zu schnell, versuch es gleich nochmal",
    // wo „dein Tarif ist voll" richtig wäre. Die ZAHLEN bleiben draußen: der
    // Schlüssel sagt nur, WELCHE Grenze, nicht wie hoch sie liegt.
    throw createError({
      status: 429,
      statusText: verdict === 'total' ? 'Quota exceeded' : 'Daily quota exceeded',
      data: { code: verdict === 'total' ? 'quota_reached' : 'quota_reached_today' },
    })
  }
}

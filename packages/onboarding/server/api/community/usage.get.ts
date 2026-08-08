import { selectUsagePosts, type CommunityUsageResponse } from '../../../shared/communityUsage'

/**
 * VERBRAUCH DIESER COMMUNITY gegen ihr Kontingent — die Datenquelle des
 * Reiters „Speicher" (F51 Paket 2, 2026-08-07).
 *
 * ── WARUM IM ONBOARDING-LAYER ──────────────────────────────────────────────
 * Dieselbe Begründung wie bei allen Geschwistern in diesem Ordner: die Seite
 * kann nur so weit reichen wie ihre Routen. Eine Silo-App ohne onboarding hat
 * weder Tarif noch Kontingent (eigenes Projekt, eigene Platte) — dort gibt es
 * die Frage gar nicht, also auch keinen Reiter ins Leere.
 *
 * ── WAS GEZÄHLT WIRD, SAGT DER PRODUKT-LAYER ───────────────────────────────
 * Nicht diese Route. Sie kennt keine einzige Produkt-Tabelle (A14 — sie dürfte
 * `COMMENTS_TABLE` gar nicht importieren) und liest stattdessen die Registry
 * `listCommunityUsageCounters()`, in die sich jeder Layer per Nitro-Plugin
 * einträgt. Ein Produkt, das diese App nicht komponiert, ist damit einfach
 * nicht dabei.
 *
 * ── DIE ZAHLEN KOMMEN AUS DER BREMSE, NICHT NEBEN IHR ──────────────────────
 * Das Kontingent löst `tenantLimitsFor()` auf — dieselbe Funktion, die
 * `assertPoolWriteQuota` fragt, bevor sie 429 wirft. Eine zweite Fassung der
 * Fallback-Kette (Control-Katalog schlägt app.config) wäre der sichere Weg zu
 * einer Anzeige, die „12 von 5.000" sagt, während bei 200 zugemacht wird.
 *
 * ── DIE DATENTÜR, UND WARUM MIT OPERATOR-KLINKE ────────────────────────────
 * Gezählt wird über `tenantDb(event, { as: 'operator', actor: 'member' })`:
 * `as: 'operator'` nimmt den Admin-Client, weil das Kontingent AUSGEBLENDETE
 * und private Zeilen mitzählt — die Bremse tut das auch (sie zählt roh über den
 * Admin-Client), und eine Anzeige, die weniger zählt als die Bremse, ist eine
 * Lüge über den eigenen Verbrauch. `actor: 'member'` sagt die Wahrheit über den
 * HANDELNDEN: hier sieht ein Owner seine eigene Community an, kein Betreiber
 * moderiert. Der Mandanten-Filter der Tür ist in beiden Fällen die Grenze.
 *
 * FAIL-SOFT je Posten: fehlt die Tabelle im Projekt (Produkt nie migriert) oder
 * antwortet Appwrite nicht, fällt DIESER Posten aus der Antwort — nicht die
 * ganze Seite. `null` statt 0, damit die pure Regel „weiß ich nicht" von
 * „nichts angelegt" unterscheiden kann.
 */
export default defineEventHandler(async (event): Promise<CommunityUsageResponse> => {
  const tenant = useTenant(event)
  // Kein Pool-Mandant (Silo, Kontroll-Host, Playground) ⇒ es gibt hier kein
  // Kontingent, also auch keine Auskunft. 404 wie bei den Geschwister-Routen.
  if (tenant?.mode !== 'pool') {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  await requireCommunityPermission(event, 'team.manage')

  const db = tenantDb(event, { as: 'operator', actor: 'member' })
  const counts = await Promise.all(listCommunityUsageCounters().map(async counter => ({
    kind: counter.kind,
    total: await db.count(counter.tableId).catch(() => null),
  })))

  return {
    plan: tenant.plan ?? '',
    posts: selectUsagePosts(counts, kind => tenantLimitsFor(event, kind)),
  }
})

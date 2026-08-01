import { z } from 'zod'
import { hasLiveSubscription } from '../../../../shared/communityBilling'
import { decideCommunityDeletion } from '../../../../shared/communityTeam'
import { COMMUNITY_MEMBERS_TABLE, type CommunityMemberRow } from '../../../../shared/types/communityMember'
import { COMMUNITIES_TABLE, type TenantRow } from '../../../../shared/types/tenantRecord'
import { requireCommunityTeamContext, throwOnDenied } from '../../../utils/communityTeam'

/**
 * COMMUNITY LÖSCHEN (C16, 2026-07-31) — die Owner-Capability `community.delete`
 * bekommt ihr Ziel.
 *
 * Am 2026-07-29 stand hier bewusst nichts (Davids Entscheidung 3: „später, ein
 * unumkehrbares Löschen braucht erst eine Wiederherstellungs-Frist"). C16 reiht
 * den Punkt wieder ein — und der Schnitt löst genau den Einwand auf:
 *
 *   **Löschen heißt hier: stilllegen + Zugänge entziehen. Inhalte bleiben.**
 *
 * Drei Schreibvorgänge, in dieser Reihenfolge, und die Reihenfolge ist Absicht:
 *
 *  1. `communities.status = 'disabled'` — ab hier liefert der Host-Resolver
 *     nichts mehr (`tenantsResolver.ts`: `row.status !== 'active'` ⇒ null), der
 *     Host antwortet also binnen ≤30 s (Resolver-Cache) mit 404. DAS ist die
 *     Wirkung, auf die es ankommt, deshalb steht sie zuerst: bricht danach
 *     etwas ab, ist die Community trotzdem zu.
 *  2. Jede Mitgliedschaft MIT Zugang auf `status='removed'` — dieselbe
 *     Semantik wie „Zugang entziehen" (Davids Entscheidung 1 vom 2026-07-29),
 *     inklusive `removedAt`. Damit kann niemand über `members/join` von selbst
 *     zurückkommen, falls die Community je wieder aktiv gesetzt wird.
 *  3. Die `runtimeUserId`s gehen ZURÜCK an die Runtime — Labels leben im
 *     Pool-Projekt, und das Control Plane hat dafür keinen Schlüssel (dieselbe
 *     Trennung wie in `members/remove`). Der Label-Entzug passiert in
 *     packages/onboarding/server/api/community/delete.post.ts.
 *
 * Der OWNER behält seine Zeile (`role: 'owner'`, aber `status: 'removed'`):
 * er soll auffindbar bleiben, wenn der Betreiber die Community wieder
 * aufschließen soll. Ein ownerloser Datensatz wäre ein Fundstück ohne
 * Ansprechpartner.
 *
 * WAS DIESE ROUTE NICHT TUT: Rows löschen, Buckets leeren, das Appwrite-Projekt
 * anfassen, den Slug freigeben. Der Hostname bleibt vergeben — sonst könnte
 * jemand anderes ihn morgen registrieren und die alten Links zeigten auf eine
 * fremde Community.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  communityId: z.string().min(1).max(36),
}).strict()

/** Deckel für den Mitglieder-Umzug: über diesen Zahlen ist eine Antwort keine
 *  Antwort mehr. Was übrig bleibt, sagt die Route ehrlich zurück. */
const MEMBER_WRITE_BUDGET_MS = 8_000

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const context = await requireCommunityTeamContext(event, body, 'community.delete')

  throwOnDenied(
    decideCommunityDeletion({
      actorRole: context.actorRole,
      communityStatus: context.tenant.status,
      liveSubscription: hasLiveSubscription({
        billingStatus: context.tenant.billingStatus ?? '',
        stripeSubscriptionId: context.tenant.stripeSubscriptionId ?? '',
      }),
    }),
    { communityId: body.communityId, actor: context.identity.userId },
  )

  const admin = createAdminClient(event)

  // 1. Die Tür zu. Zuerst, damit ein Abbruch danach nichts offen lässt.
  await admin.tablesDB.updateRow<TenantRow>({
    databaseId: context.databaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: body.communityId,
    data: { status: 'disabled' },
  }).catch((error) => { throw toH3Error(error, 'Could not disable community') })

  // 2. Zugänge entziehen — dieselbe Semantik wie „Zugang entziehen".
  const removedAt = new Date().toISOString()
  const active = context.members.filter(member => member.status === 'active')
  const runtimeUserIds: string[] = []
  let failed = 0
  const startedAt = Date.now()

  for (const member of active) {
    if (Date.now() - startedAt > MEMBER_WRITE_BUDGET_MS) break
    try {
      await admin.tablesDB.updateRow<CommunityMemberRow>({
        databaseId: context.databaseId,
        tableId: COMMUNITY_MEMBERS_TABLE,
        rowId: member.$id,
        data: { status: 'removed', removedAt },
      })
      runtimeUserIds.push(member.runtimeUserId)
    }
    catch {
      // Einzelne Zeilen dürfen den Vorgang nicht kippen: die Community ist
      // bereits zu, und ein hängengebliebener Zugang läuft ins 404. Die Zahl
      // reist mit, damit ein zweiter Klick fortsetzen kann.
      failed++
    }
  }

  const complete = runtimeUserIds.length + failed === active.length && failed === 0

  logEvent('warn', 'community.deleted', {
    communityId: body.communityId,
    actor: context.identity.userId,
    host: context.tenant.host,
    members: active.length,
    removed: runtimeUserIds.length,
    failed,
    complete,
  })

  return {
    ok: true,
    communityId: body.communityId,
    status: 'disabled' as const,
    /** Die Runtime zieht damit die Community-Labels ein (Labels = Pool-Projekt). */
    runtimeUserIds,
    members: { total: active.length, removed: runtimeUserIds.length, failed, complete },
  }
})

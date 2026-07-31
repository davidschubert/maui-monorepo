import type { H3Event } from 'h3'
import { z } from 'zod'
import { hasCapability } from '../../../core/shared/authz'
import { COMMUNITIES_TABLE, type TenantRow } from '../../shared/types/tenantRecord'
import { ANONYMOUS_ACTOR, type FeedbackActor } from '../../shared/customerFeedback'
import { verifyRuntimeIdentity } from './onboardingService'

/**
 * Wer handelt gerade? — die Naht zwischen „irgendein Aufrufer" und dem
 * `FeedbackActor`, mit dem das Control Plane danach arbeitet.
 *
 * ZWEI HERKÜNFTE, EIN ERGEBNIS:
 *
 *  1. **Service-Naht** (Runtime-App fragt für ihr Dashboard): Secret beweist
 *     das Deployment, Appwrite-JWT beweist den Menschen. Das JWT prüft das
 *     Control Plane SELBST gegen das Pool-Projekt — es glaubt der Platform-App
 *     keine Identitätsbehauptung (onboardingService.ts).
 *  2. **In-Process** (apps/control ist selbst das Control Plane): die eigene
 *     Session, plus `feedback.manage` für die Betreiber-Sicht.
 *
 * DIE COMMUNITY KOMMT NICHT AUS DEM BODY DURCH. Der Aufrufer nennt eine
 * `communityId`, das Control Plane schlägt die Zeile NACH und übernimmt den
 * Namen von dort — und nur, wenn die Community zu genau dem Projekt gehört,
 * gegen das das JWT geprüft wurde. Ohne diese Zeile könnte ein durchgereichter
 * Wert Feedback unter fremdem Absender einliefern. Passt es nicht, bleibt die
 * Herkunft leer statt falsch: ein anonymer Eintrag ist ein kleiner Verlust,
 * ein falsch zugeordneter eine Fehlinformation im Betreiber-Dashboard.
 *
 * `feedback.manage` ist bewusst die Betreiber-Capability aus der GLOBALEN
 * Rechte-Quelle (Labels). Über die Service-Naht ist `isOperator` deshalb IMMER
 * false — Community-Rollen tragen die Capability nicht (N1), und die Herkunft
 * ist genau das, was ein Kunde nie sehen soll (Entscheidung 2).
 */

export const feedbackActorSchema = z.object({
  /** Kurzlebiges Appwrite-JWT des Handelnden; fehlt = anonym (Entscheidung 4). */
  jwt: z.string().min(1).max(4096).optional(),
  /** Community, auf deren Host gehandelt wird; '' = Kontroll-Host/keine. */
  communityId: z.string().max(36).optional(),
})

export type FeedbackActorInput = z.infer<typeof feedbackActorSchema>

/** Community nachschlagen — Name aus der QUELLE, Projekt-Bindung geprüft. */
async function resolveCommunity(
  event: H3Event,
  communityId: string,
  projectId: string,
): Promise<{ communityId: string, communityName: string }> {
  if (!communityId) return { communityId: '', communityName: '' }
  const config = useRuntimeConfig(event)
  const admin = createAdminClient(event)
  const row = await admin.tablesDB.getRow<TenantRow>({
    databaseId: config.public.appwriteDatabaseId,
    tableId: COMMUNITIES_TABLE,
    rowId: communityId,
  }).catch(() => null)
  if (!row || row.projectId !== projectId) {
    logEvent('warn', 'feedback.community_mismatch', { communityId, projectId })
    return { communityId: '', communityName: '' }
  }
  return { communityId: row.$id, communityName: row.name || '' }
}

/** Actor aus der Service-Naht (Runtime-App). */
export async function feedbackActorFromService(event: H3Event, input: FeedbackActorInput): Promise<FeedbackActor> {
  if (!input.jwt) return ANONYMOUS_ACTOR

  const identity = await verifyRuntimeIdentity(event, input.jwt)
  const community = await resolveCommunity(event, input.communityId ?? '', identity.projectId)

  return {
    projectId: identity.projectId,
    userId: identity.userId,
    name: identity.name,
    email: identity.email,
    communityId: community.communityId,
    communityName: community.communityName,
    // Nie über die Naht: die Betreiber-Sicht gibt es ausschließlich in
    // apps/control, mit einem globalen Label (Entscheidung 2).
    isOperator: false,
  }
}

/**
 * Actor aus der EIGENEN Session (apps/control ruft sich selbst nicht über
 * HTTP). Ohne Session bleibt es der anonyme Actor — der Feedback-Knopf sitzt
 * auch auf den öffentlichen Seiten des Betreiber-Hosts.
 */
export function feedbackActorFromSession(event: H3Event): FeedbackActor {
  const user = event.context.user
  if (!user) return ANONYMOUS_ACTOR
  const config = useRuntimeConfig(event)
  return {
    projectId: config.public.appwriteProjectId,
    userId: user.$id,
    name: user.name ?? '',
    email: user.email ?? '',
    // Der Betreiber-Host trägt keine Community — sein Feedback ist Betreiber-
    // Feedback, und die Stummschaltung greift bei ihm folgerichtig nicht.
    communityId: '',
    communityName: '',
    isOperator: hasCapability(user.labels, 'feedback.manage'),
  }
}

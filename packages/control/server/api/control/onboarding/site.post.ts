import { z } from 'zod'
import { onboardingSiteSchema } from '../../../../schemas/onboarding'
import { checkInviteCode, consumeInviteCode } from '../../../utils/inviteCodes'
import { markCodeRedeemed } from '../../../utils/inviteRequests'
import { provisionCommunity } from '../../../utils/onboardingProvision'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'

/**
 * Self-Service: neue Community anlegen (SAAS-ROADMAP #1, Schritt 7 des Wizards).
 *
 * Aufrufer ist die PLATFORM-App, nicht der Browser — deshalb zwei Beweise
 * (Service-Secret + Appwrite-JWT des Nutzers, s. onboardingService.ts). Das
 * Control Plane prüft die Identität selbst; es glaubt dem Aufrufer nichts.
 *
 * Kein `requirePermission`: das ist bewusst KEINE Betreiber-Route. Autorisiert
 * wird über (a) das gültige JWT eines Runtime-Users, (b) einen gültigen
 * Einladungs-Code und (c) das Konto-Kontingent.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  site: onboardingSiteSchema,
}).strict()

export default defineEventHandler(async (event) => {
  requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  // Early-Access-Tor. Nach außen bleibt jede Ablehnung dieselbe Antwort
  // (kein Code-Ratespiel), der Grund steht nur im Log. Die Adresse geht mit:
  // ein an jemanden vergebener Code (control-017) gilt NUR für dessen Konto —
  // weiterleiten bringt nichts.
  const invite = await checkInviteCode(event, body.site.inviteCode, Date.now(), identity.email)
  if (!invite.valid) {
    logEvent('warn', 'onboarding.invite_rejected', {
      reason: invite.reason,
      runtimeUserId: identity.userId,
    })
    throw createError({ status: 403, statusText: 'Invalid invite code' })
  }

  const result = await provisionCommunity(event, identity, {
    name: body.site.name,
    slug: body.site.slug,
    vibe: body.site.vibe,
    profile: {
      purpose: body.site.purpose,
      memberRange: body.site.memberRange,
      category: body.site.category,
      goal: body.site.goal,
      ...(body.site.description ? { description: body.site.description } : {}),
    },
    inviteCode: invite.row,
  })

  // Erst nach erfolgreicher Anlage — und nur, wenn wirklich etwas Neues
  // entstanden ist: ein Retry (reused) darf den Code nicht zweimal kosten.
  if (!result.reused && invite.row) {
    await consumeInviteCode(event, invite.row)
    // Rückschreibung: aus „zugewiesen" wird die TATSACHE „eingelöst am … →
    // diese Community". Ohne sie wüsste der Betreiber nie, ob seine Einladung
    // angekommen ist — und genau das ist die Frage, die er stellt.
    await markCodeRedeemed(event, invite.row, result.siteId)
  }

  return result
})

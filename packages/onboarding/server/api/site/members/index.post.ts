import { Query } from 'node-appwrite'
import { z } from 'zod'
import { SITE_ROLES } from '../../../../../control/shared/types/communityMember'
import { callControlPlane } from '../../../utils/controlPlane'
import { requireSiteTeamGate } from '../../../utils/siteTeamGate'

/**
 * Jemanden einladen — EIN Feld, eine Rollenwahl (Davids Entscheidung 2).
 *
 * Der Betreiber macht immer denselben Handgriff; ob die Person Pukalani schon
 * kennt, merkt sie selbst:
 *  - **Konto existiert** (z. B. aus einer anderen Community): sie bekommt die Mail
 *    UND eine In-App-Benachrichtigung. Nach dem Anmelden ist es EIN Klick.
 *  - **Kein Konto**: nur die Mail; der Link führt über Registrierung → Annahme.
 *
 * Die Konto-Prüfung kann NUR hier passieren — das Control Plane hat keinen
 * Zugriff auf die Nutzer des Pool-Projekts. Sie ist bewusst nur Komfort: die
 * Antwort verrät dem Betreiber, was passiert ist, nicht mehr (kein Konto-Orakel
 * über fremde Adressen — er lädt ja selbst gerade jemanden ein).
 *
 * 'owner' lehnt das Control Plane ab (decideInvite) — Besitz entsteht durch
 * Gründung oder Übergabe.
 */
const bodySchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(SITE_ROLES),
}).strict()

interface InviteResult {
  ok: boolean
  inviteId: string
  email: string
  role: string
  expiresAt: string
}

export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireSiteTeamGate(event, 'team.manage')
  const body = await readValidatedBody(event, bodySchema.parse)
  const email = body.email.trim().toLowerCase()

  // Mail-Sprache = Sprache des einladenden Dashboards (die der Eingeladenen
  // kennt niemand). Cookie statt Header: er trägt die bewusste Wahl.
  const locale = getCookie(event, 'i18n_redirected') === 'en' ? 'en' : 'de'

  const result = await callControlPlane<InviteResult>(
    event,
    '/api/control/site/members/invite',
    { jwt, communityId, email, role: body.role, locale },
  )

  // Existiert ein Konto? Dann zusätzlich in-app benachrichtigen — best-effort,
  // notify() wirft nie.
  let existingAccount = false
  try {
    const admin = createAdminClient(event)
    const found = await admin.users.list({ queries: [Query.equal('email', email), Query.limit(1)] })
    const invitee = found.users[0]
    if (invitee) {
      existingAccount = true
      const tenant = useTenant(event)
      // `title` ist der {name}-Platzhalter der Glocken-Meldung („Einladung zu
      // {name}") — deshalb steht dort der Community-Name, nicht ein Satz. Der
      // Link führt auf /join OHNE Token: die Seite findet die offene Einladung
      // über die eigene, geprüfte Adresse. Das ist der „eine Klick".
      const siteName = (tenant?.name ?? '').trim()
      if (siteName) {
        await notify(event, {
          // Einladung in EINE Community → scope 'tenant' (Pflichtfeld seit
          // C15). Ohne den Stempel läge die Meldung im mandantenlosen
          // Kontobereich, wo sie nichts zu suchen hat: eine Einladung gehört
          // zu der Community, die einlädt.
          scope: 'tenant',
          recipientId: invitee.$id,
          type: 'siteInvite',
          title: siteName,
          body: '',
          link: '/join',
          senderId: event.context.user?.$id,
        })
      }
    }
  }
  catch {
    // Die Einladung steht und die Mail ist raus — ein fehlender Hinweis im
    // Glockensymbol darf daran nichts ändern.
  }

  return { ...result, existingAccount }
})

import type { H3Event } from 'h3'

/**
 * Das Site-Label des Mitglieds (H3-Naht 4, O5).
 *
 * Warum es das braucht: eine private Community trägt ihre Zeilen mit
 * `read(Role.label(siteId))` (tenantRowPermissionsFor). Appwrite gewährt diesen
 * Lesezugriff nur, wenn der Nutzer das Label AUCH HAT — ohne Label wäre der
 * frische Owner in seiner eigenen Community blind.
 *
 * Warum HIER und nicht im Control Plane: Labels gehören dem RUNTIME-Projekt
 * (Pool), und nur diese App hat dafür einen Schlüssel. Das Control Plane
 * besitzt die Mitgliedschaft, die Runtime das Label — dieselbe Trennung wie
 * überall sonst in H3.
 *
 * ADDITIV: bestehende Labels bleiben (ein Mitglied kann in mehreren Communities
 * sein, und `admin`/`moderator` des Betreibers dürfen nicht verloren gehen).
 */

/** Appwrite akzeptiert für Labels nur Alphanumerik — ID.unique() liefert genau das. */
const SAFE_LABEL = /^[a-zA-Z0-9]{1,36}$/

export async function grantSiteLabel(event: H3Event, siteId: string): Promise<void> {
  const user = event.context.user
  if (!user?.$id || !siteId) return

  if (!SAFE_LABEL.test(siteId)) {
    // Fail-loud im Log statt Appwrite-400 im Gesicht des Kunden: die Community
    // existiert schon, nur das Lesen wäre kaputt — das muss sichtbar sein.
    logEvent('error', 'onboarding.site_label_invalid', { siteId })
    return
  }

  const labels = user.labels ?? []
  if (labels.includes(siteId)) return

  try {
    const { users } = createAdminClient(event)
    await users.updateLabels({ userId: user.$id, labels: [...labels, siteId] })
  }
  catch (error) {
    logEvent('error', 'onboarding.site_label_failed', {
      siteId,
      userId: user.$id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

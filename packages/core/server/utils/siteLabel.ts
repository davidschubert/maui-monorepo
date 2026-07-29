import type { H3Event } from 'h3'
import { isRole } from '../../shared/authz'

/**
 * Das Site-Label des Mitglieds (H3-Naht 4) — der Schlüssel, mit dem Appwrite
 * die Mandanten-Grenze SELBST zieht.
 *
 * Warum es das braucht: eine Community trägt ihre Zeilen mit
 * `read(Role.label(siteId))` (tenantRowPermissionsFor) — seit A4 auch die
 * Presence jedes Anwesenden. Appwrite gewährt diesen Lesezugriff nur, wer das
 * Label AUCH HAT; ohne Label wäre ein Mitglied in seiner eigenen Community
 * blind.
 *
 * Warum in CORE (seit 2026-07-29, vorher packages/onboarding): der einzige
 * Aufrufer war die Wizard-Route — also bekam nur der GRÜNDER das Label. Mit A4
 * vergibt es die Middleware `site-label.ts` an jedes Mitglied, und die ist ein
 * Fundament-Baustein. Der Helfer benutzt nur die Users-API und den
 * Tenant-Kontext, hängt also an keinem Feature (A14 erfüllt).
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

  // Billiger Vorab-Ausschluss aus dem Request-Kontext: nach dem ersten Kontakt
  // ist das der Normalfall und kostet KEINEN Appwrite-Roundtrip.
  if ((user.labels ?? []).includes(siteId)) return

  // Ein Site-Label darf NIE eine Operator-Rolle sein. Labels sind bei uns zwei
  // Dinge in einem Feld: Betreiber-RBAC ('admin'/'moderator', hasCapability)
  // und Site-Zugehörigkeit (die $id). Seit die Vergabe an JEDES Mitglied geht
  // (site-label.ts), wäre eine Site mit der $id 'admin' eine Rechteausweitung
  // per Tippfehler. Kostet einen String-Vergleich.
  if (isRole(siteId)) {
    logEvent('error', 'site_label.reserved', { siteId })
    return
  }

  if (!SAFE_LABEL.test(siteId)) {
    // Fail-loud im Log statt Appwrite-400 im Gesicht des Kunden: die Community
    // existiert schon, nur das Lesen wäre kaputt — das muss sichtbar sein.
    logEvent('error', 'site_label.invalid', { siteId })
    return
  }

  try {
    const { users } = createAdminClient(event)
    // FRISCH lesen statt event.context.user zu vertrauen: `updateLabels` setzt
    // das ganze Array. Wer parallel auf ZWEI Communities unterwegs ist, hätte
    // sonst zwei Requests, die beide vom selben (alten) Stand ausgehen — der
    // zweite überschriebe das Label des ersten. Das Fenster wird damit auf
    // wenige Millisekunden klein; ginge es trotzdem verloren, heilt der
    // nächste Request auf jenem Host es wieder (die Vergabe ist idempotent).
    const fresh = await users.get({ userId: user.$id })
    const labels = fresh.labels ?? []
    if (labels.includes(siteId)) return
    const next = [...labels, siteId]
    await users.updateLabels({ userId: user.$id, labels: next })
    // Der laufende Request sieht sein neues Label sofort (nachgelagerte
    // Autorisierung/Permission-Bauer lesen aus dem Kontext, nicht aus Appwrite).
    user.labels = next
    logEvent('info', 'site_label.granted', { siteId, userId: user.$id })
  }
  catch (error) {
    logEvent('error', 'site_label.failed', {
      siteId,
      userId: user.$id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

import type { H3Event } from 'h3'
import { isRole } from '../../shared/authz'

/**
 * Das Site-Label des Mitglieds (H3-Naht 4) — der Schlüssel, mit dem Appwrite
 * die Mandanten-Grenze SELBST zieht.
 *
 * Warum es das braucht: eine Community trägt ihre Zeilen mit
 * `read(Role.label(communityId))` (tenantRowPermissionsFor) — seit A4 auch die
 * Presence jedes Anwesenden. Appwrite gewährt diesen Lesezugriff nur, wer das
 * Label AUCH HAT; ohne Label wäre ein Mitglied in seiner eigenen Community
 * blind.
 *
 * Warum in CORE (seit 2026-07-29, vorher packages/onboarding): der einzige
 * Aufrufer war die Wizard-Route — also bekam nur der GRÜNDER das Label. Der
 * Helfer benutzt nur die Users-API und den Tenant-Kontext, hängt also an keinem
 * Produkt (A14 erfüllt).
 *
 * Warum HIER und nicht im Control Plane: Labels gehören dem RUNTIME-Projekt
 * (Pool), und nur diese App hat dafür einen Schlüssel. Das Control Plane
 * besitzt die Mitgliedschaft, die Runtime das Label — dieselbe Trennung wie
 * überall sonst in H3. Deshalb muss auch der ENTZUG hier passieren
 * (revokeSiteLabel): `members/remove` im Control Plane kann Labels nicht
 * anfassen, es hat keinen Pool-Schlüssel.
 *
 * WAS DAS LABEL SEIT A5 BEDEUTET (2026-07-29): „ist Mitglied dieser Community",
 * abgeleitet aus einer `community_members`-Zeile mit Zugang — NICHT mehr „hat den
 * Host benutzt" (A4). Vergeben wird es deshalb nur noch dort, wo Mitgliedschaft
 * feststeht: joinSite() (Beitritt/Bestand), die Label-Middleware (bestehende
 * Mitgliedschaft) und der Wizard (Gründung). Der Unterschied ist nicht
 * akademisch: unter der A4-Regel bekam eine entfernte Person ihr Leserecht beim
 * nächsten eingeloggten Besuch zurück.
 *
 * ADDITIV: bestehende Labels bleiben (ein Mitglied kann in mehreren Communities
 * sein, und `admin`/`moderator` des Betreibers dürfen nicht verloren gehen).
 */

/** Appwrite akzeptiert für Labels nur Alphanumerik — ID.unique() liefert genau das. */
const SAFE_LABEL = /^[a-zA-Z0-9]{1,36}$/

/**
 * Ist dieser Wert als Site-Label überhaupt zulässig?
 *
 * Ein Site-Label darf NIE eine Operator-Rolle sein. Labels sind bei uns zwei
 * Dinge in einem Feld: Betreiber-RBAC ('admin'/'moderator', hasCapability) und
 * Site-Zugehörigkeit (die $id). Seit die Vergabe an JEDES Mitglied geht, wäre
 * eine Site mit der $id 'admin' eine Rechteausweitung per Tippfehler. Kostet
 * einen String-Vergleich.
 *
 * Fail-loud im Log statt Appwrite-400 im Gesicht des Kunden: die Community
 * existiert schon, nur das Lesen wäre kaputt — das muss sichtbar sein.
 */
function labelUsable(communityId: string): boolean {
  if (isRole(communityId)) {
    logEvent('error', 'site_label.reserved', { communityId })
    return false
  }
  if (!SAFE_LABEL.test(communityId)) {
    logEvent('error', 'site_label.invalid', { communityId })
    return false
  }
  return true
}

/**
 * Site-Label vergeben. `userId` nur angeben, wenn es NICHT der Nutzer des
 * Requests ist (Anmeldung: der Kontext-User existiert noch nicht).
 */
export async function grantSiteLabel(event: H3Event, communityId: string, userId?: string): Promise<void> {
  const user = event.context.user
  const targetId = userId ?? user?.$id
  const isRequestUser = !!targetId && targetId === user?.$id
  if (!targetId || !communityId) return

  // Billiger Vorab-Ausschluss aus dem Request-Kontext: nach dem ersten Kontakt
  // ist das der Normalfall und kostet KEINEN Appwrite-Roundtrip.
  if (isRequestUser && (user?.labels ?? []).includes(communityId)) return

  if (!labelUsable(communityId)) return

  try {
    const { users } = createAdminClient(event)
    // FRISCH lesen statt event.context.user zu vertrauen: `updateLabels` setzt
    // das ganze Array. Wer parallel auf ZWEI Communities unterwegs ist, hätte
    // sonst zwei Requests, die beide vom selben (alten) Stand ausgehen — der
    // zweite überschriebe das Label des ersten. Das Fenster wird damit auf
    // wenige Millisekunden klein; ginge es trotzdem verloren, heilt der
    // nächste Request auf jenem Host es wieder (die Vergabe ist idempotent).
    const fresh = await users.get({ userId: targetId })
    const labels = fresh.labels ?? []
    if (labels.includes(communityId)) return
    const next = [...labels, communityId]
    await users.updateLabels({ userId: targetId, labels: next })
    // Der laufende Request sieht sein neues Label sofort (nachgelagerte
    // Autorisierung/Permission-Bauer lesen aus dem Kontext, nicht aus Appwrite).
    if (isRequestUser && user) user.labels = next
    logEvent('info', 'site_label.granted', { communityId, userId: targetId })
  }
  catch (error) {
    logEvent('error', 'site_label.failed', {
      communityId,
      userId: targetId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Site-Label EINZIEHEN — „draußen" heißt draußen (A5, Davids Entscheidung 1).
 *
 * Der Gegenzug zu grantSiteLabel und der Grund, warum „Zugang entziehen" jetzt
 * hält, was die Seite verspricht: ohne diesen Schritt bliebe der Lesezugriff auf
 * alle `read(label:<communityId>)`-Zeilen bestehen (Presence, Activity-Feed,
 * mitglieder-sichtbare Inhalte) — die Rolle war weg, das Publikum nicht.
 *
 * CHIRURGISCH: nur dieses eine Label fällt weg. Andere Communities und die
 * Operator-Rollen ('admin'/'moderator') bleiben unangetastet — ein `labels: []`
 * hätte einen Betreiber, der zufällig Mitglied einer Kunden-Community ist, aus
 * seiner eigenen Instanz ausgesperrt.
 *
 * Kein Fehler, wenn nichts wegzunehmen ist (idempotent): der Entzug läuft an
 * zwei Stellen — sofort in der Entfernen-Route und als Selbstheilung in der
 * Label-Middleware, falls der erste Versuch danebenging.
 */
export async function revokeSiteLabel(event: H3Event, communityId: string, userId?: string): Promise<void> {
  const user = event.context.user
  const targetId = userId ?? user?.$id
  if (!targetId || !communityId) return
  if (!labelUsable(communityId)) return

  try {
    const { users } = createAdminClient(event)
    const fresh = await users.get({ userId: targetId })
    const labels = fresh.labels ?? []
    if (!labels.includes(communityId)) return
    const next = labels.filter(label => label !== communityId)
    await users.updateLabels({ userId: targetId, labels: next })
    if (targetId === user?.$id && user) user.labels = next
    logEvent('info', 'site_label.revoked', { communityId, userId: targetId })
  }
  catch (error) {
    logEvent('error', 'site_label.revoke_failed', {
      communityId,
      userId: targetId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

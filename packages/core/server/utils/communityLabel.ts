import type { H3Event } from 'h3'
import { isRole } from '../../shared/authz'
import { communityModeratorLabel } from '../../shared/communityModeratorLabel'

/**
 * Das Community-Label des Mitglieds (H3-Naht 4) — der Schlüssel, mit dem Appwrite
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
 * (revokeCommunityLabel): `members/remove` im Control Plane kann Labels nicht
 * anfassen, es hat keinen Pool-Schlüssel.
 *
 * WAS DAS LABEL SEIT A5 BEDEUTET (2026-07-29): „ist Mitglied dieser Community",
 * abgeleitet aus einer `community_members`-Zeile mit Zugang — NICHT mehr „hat den
 * Host benutzt" (A4). Vergeben wird es deshalb nur noch dort, wo Mitgliedschaft
 * feststeht: joinCommunity() (Beitritt/Bestand), die Label-Middleware (bestehende
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
 * Ist dieser Wert als Community-Label überhaupt zulässig?
 *
 * Ein Community-Label darf NIE eine Operator-Rolle sein. Labels sind bei uns zwei
 * Dinge in einem Feld: Betreiber-RBAC ('admin'/'moderator', hasCapability) und
 * Community-Zugehörigkeit (die $id). Seit die Vergabe an JEDES Mitglied geht,
 * wäre eine Community mit der $id 'admin' eine Rechteausweitung per Tippfehler. Kostet
 * einen String-Vergleich.
 *
 * Fail-loud im Log statt Appwrite-400 im Gesicht des Kunden: die Community
 * existiert schon, nur das Lesen wäre kaputt — das muss sichtbar sein.
 */
function labelUsable(communityId: string): boolean {
  if (isRole(communityId)) {
    logEvent('error', 'community_label.reserved', { communityId })
    return false
  }
  if (!SAFE_LABEL.test(communityId)) {
    logEvent('error', 'community_label.invalid', { communityId })
    return false
  }
  return true
}

/**
 * DER EINE SCHREIBVORGANG auf `users.labels` (add ∪ remove, idempotent).
 *
 * Warum generisch: seit dem Moderations-Audit (Befund 1) gibt es je Community
 * ZWEI abgeleitete Labels — die Zugehörigkeit (`<communityId>`) und das
 * Moderations-Team (`mod<communityId>`, communityModeratorLabel.ts). Beide
 * werden mit derselben Vorsicht geschrieben, und beim Entzug fallen sie
 * GEMEINSAM in EINEM `updateLabels` — zwei Schreibvorgänge hintereinander
 * wären zwei Gelegenheiten, sich gegenseitig zu überschreiben.
 *
 * Wirft NIE: ein Fehlschlag heißt „noch nicht sichtbar", nie „Seite kaputt".
 */
async function writeLabels(
  event: H3Event,
  targetId: string,
  { add = [], remove = [] }: { add?: string[], remove?: string[] },
  action: 'granted' | 'revoked',
): Promise<void> {
  const user = event.context.user
  const isRequestUser = targetId === user?.$id
  const usable = add.filter(labelUsable)
  if (usable.length === 0 && remove.length === 0) return

  // Billiger Vorab-Ausschluss aus dem Request-Kontext: nach dem ersten Kontakt
  // ist das der Normalfall und kostet KEINEN Appwrite-Roundtrip.
  if (isRequestUser) {
    const have = user?.labels ?? []
    const nothingToAdd = usable.every(label => have.includes(label))
    const nothingToRemove = remove.every(label => !have.includes(label))
    if (nothingToAdd && nothingToRemove) return
  }

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
    const next = [...labels.filter(label => !remove.includes(label))]
    for (const label of usable) if (!next.includes(label)) next.push(label)
    if (next.length === labels.length && next.every((label, i) => label === labels[i])) return
    await users.updateLabels({ userId: targetId, labels: next })
    // Der laufende Request sieht seinen neuen Stand sofort (nachgelagerte
    // Autorisierung/Permission-Bauer lesen aus dem Kontext, nicht aus Appwrite).
    if (isRequestUser && user) user.labels = next
    logEvent('info', `community_label.${action}`, {
      labels: (action === 'granted' ? usable : remove).join(','),
      userId: targetId,
    })
  }
  catch (error) {
    logEvent('error', `community_label.${action === 'granted' ? 'failed' : 'revoke_failed'}`, {
      labels: [...usable, ...remove].join(','),
      userId: targetId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Community-Label vergeben. `userId` nur angeben, wenn es NICHT der Nutzer des
 * Requests ist (Anmeldung: der Kontext-User existiert noch nicht).
 */
export async function grantCommunityLabel(event: H3Event, communityId: string, userId?: string): Promise<void> {
  const targetId = userId ?? event.context.user?.$id
  if (!targetId || !communityId) return
  await writeLabels(event, targetId, { add: [communityId] }, 'granted')
}

/**
 * MODERATIONS-LABEL setzen oder einziehen (Moderations-Audit Befund 1).
 *
 * Es folgt der ROLLE, nicht der Mitgliedschaft: wer in dieser Community
 * `reports.moderate` hält, trägt es — wer degradiert wird, verliert es beim
 * nächsten Request (der Rollen-Cache ist 30 s). Der Aufrufer entscheidet nur
 * anhand einer AUFGELÖSTEN Rolle; bei einem transienten Auflösungsfehler wird
 * diese Funktion bewusst gar nicht erst gerufen (siehe Middleware), sonst
 * flackerte das Publikum eines Moderators bei jedem Netz-Schluckauf.
 */
export async function setCommunityModeratorLabel(
  event: H3Event,
  communityId: string,
  isModerator: boolean,
  userId?: string,
): Promise<void> {
  const targetId = userId ?? event.context.user?.$id
  const label = communityModeratorLabel(communityId)
  if (!targetId || !label) return
  await writeLabels(
    event,
    targetId,
    isModerator ? { add: [label] } : { remove: [label] },
    isModerator ? 'granted' : 'revoked',
  )
}

/**
 * Community-Label EINZIEHEN — „draußen" heißt draußen (A5, Davids Entscheidung 1).
 *
 * Der Gegenzug zu grantCommunityLabel und der Grund, warum „Zugang entziehen" jetzt
 * hält, was die Seite verspricht: ohne diesen Schritt bliebe der Lesezugriff auf
 * alle `read(label:<communityId>)`-Zeilen bestehen (Presence, Activity-Feed,
 * mitglieder-sichtbare Inhalte) — die Rolle war weg, das Publikum nicht.
 *
 * CHIRURGISCH: nur die Labels DIESER Community fallen weg. Andere Communities
 * und die Operator-Rollen ('admin'/'moderator') bleiben unangetastet — ein
 * `labels: []` hätte einen Betreiber, der zufällig Mitglied einer
 * Kunden-Community ist, aus seiner eigenen Instanz ausgesperrt.
 *
 * BEIDE LABELS, EIN SCHREIBVORGANG (Moderations-Audit Befund 1): „draußen"
 * heißt auch für das Moderations-Team draußen. Das hier ist die einzige Stelle,
 * an der man es vergessen KÖNNTE — deshalb steht es hier und nicht in den
 * Aufrufern (Entfernen-Route, Community-Löschung, Selbstheilung).
 *
 * Kein Fehler, wenn nichts wegzunehmen ist (idempotent): der Entzug läuft an
 * zwei Stellen — sofort in der Entfernen-Route und als Selbstheilung in der
 * Label-Middleware, falls der erste Versuch danebenging.
 */
export async function revokeCommunityLabel(event: H3Event, communityId: string, userId?: string): Promise<void> {
  const targetId = userId ?? event.context.user?.$id
  if (!targetId || !communityId) return
  if (!labelUsable(communityId)) return

  const modLabel = communityModeratorLabel(communityId)
  await writeLabels(
    event,
    targetId,
    { remove: modLabel ? [communityId, modLabel] : [communityId] },
    'revoked',
  )
}

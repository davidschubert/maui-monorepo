import { callControlPlane } from '../../../utils/controlPlane'
import { requireSiteTeamGate } from '../../../utils/siteTeamGate'

/**
 * Einem Mitglied den Zugang entziehen.
 *
 * DELETE als Methode, aber KEIN Löschen: die Mitgliedschaft wird auf
 * status='removed' gesetzt, Inhalte und Namen bleiben (Davids Entscheidung 1 vom
 * 2026-07-29). Die Methode beschreibt, was der Betreiber tut („diesen Zugang
 * weg"), nicht was in der Zeile passiert — die Begründung steht in
 * control/api/control/site/members/remove.post.ts.
 *
 * ZWEI SCHRITTE, ZWEI PROJEKTE (A5): das Control Plane nimmt die ROLLE (seine
 * Tabelle), diese Route nimmt das LESE-PUBLIKUM (das Site-Label lebt im
 * Pool-Projekt, und nur die Runtime hat dafür einen Schlüssel). Ohne den zweiten
 * Schritt wäre „Zugang entziehen" ein Versprechen ohne Wirkung: die Rolle war
 * weg, das Label blieb — und mit ihm der Lesezugriff auf Presence, Activity-Feed
 * und mitglieder-sichtbare Zeilen.
 *
 * Reihenfolge ist Absicht: erst die Rolle (das Control Plane darf ablehnen, z. B.
 * „letzter Owner"), dann das Label. Der umgekehrte Weg hätte einem Mitglied nach
 * einer abgelehnten Entfernung das Publikum genommen.
 *
 * Der Label-Entzug ist BEST-EFFORT und darf die Antwort nicht kippen: die
 * Mitgliedschaft ist entzogen, das ist die Wahrheit. Bleibt das Label hängen,
 * heilt die Label-Middleware es beim nächsten Besuch der entfernten Person
 * (site-label.ts: Label ohne aktive Zeile → das Control Plane sagt 'removed' →
 * Label weg). Zurück kommt der Zugang nie von selbst.
 */
export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireSiteTeamGate(event, 'team.manage')
  const memberId = getRouterParam(event, 'id')
  if (!memberId) {
    throw createError({ status: 400, statusText: 'Missing member id' })
  }

  const result = await callControlPlane<{
    ok: boolean
    memberId: string
    status: string
    runtimeUserId?: string
  }>(
    event,
    '/api/control/site/members/remove',
    { jwt, communityId, memberId },
  )

  if (result.runtimeUserId) {
    // Erst merken, dann einziehen: der Rollen-Resolver cacht 30 s, und ohne
    // diese Notiz vergäbe die Label-Middleware das Publikum beim nächsten
    // Request der entfernten Person sofort wieder (siehe siteJoin.ts).
    rememberSiteAccessRevoked(communityId, result.runtimeUserId)
    await revokeSiteLabel(event, communityId, result.runtimeUserId)
  }

  return { ok: result.ok, memberId: result.memberId, status: result.status }
})

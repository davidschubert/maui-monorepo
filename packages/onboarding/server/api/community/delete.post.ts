import { callControlPlane } from '../../utils/controlPlane'
import { requireCommunityTeamGate } from '../../utils/communityTeamGate'

/**
 * DIESE COMMUNITY LÖSCHEN (C16, 2026-07-31) — Owner-Route, gleiche Kette wie
 * Übergabe und Branding: `community.delete` prüfen, JWT prägen, Service-Naht
 * zum Control Plane (`communities` gehört dorthin, die Platform-App hat nur
 * einen Read-only-Key).
 *
 * DER BEWUSSTE SCHNITT — **Deaktivieren + Zugänge entziehen, Daten bleiben.**
 * Kein Hard-Delete: die Begründung steht bei der puren Regel
 * (`decideCommunityDeletion` in packages/control/shared/communityTeam.ts), die
 * Wirkung in der Gegenroute
 * (packages/control/server/api/control/community/delete.post.ts).
 *
 * ZWEI SCHRITTE, ZWEI PROJEKTE — genau wie „Zugang entziehen" (A5): das
 * Control Plane nimmt Status und Rollen (seine Tabellen), DIESE Route nimmt das
 * LESE-PUBLIKUM. Community-Labels leben im Pool-Projekt, und nur die Runtime hat
 * dafür einen Schlüssel. Ohne den zweiten Schritt wäre die Community zwar
 * offline, ihre `read(label:<communityId>)`-Zeilen aber weiterhin für jedes
 * ehemalige Mitglied lesbar — etwa über eine andere Community desselben Pools.
 *
 * Der Label-Entzug ist BEST-EFFORT und darf die Antwort nicht kippen: die
 * Community IST stillgelegt, das ist die Wahrheit. Was hängen bleibt, heilt die
 * Label-Middleware beim nächsten Request der betroffenen Person
 * (06.community-label.ts: Label ohne aktive Mitgliedschaft ⇒ Label weg).
 *
 * WARUM POST UND NICHT DELETE: die Route löscht nichts. `POST …/delete` sagt
 * „führe den Vorgang Löschen aus" — DELETE hätte behauptet, hier verschwinde
 * eine Ressource.
 */
export default defineEventHandler(async (event) => {
  const { communityId, jwt } = await requireCommunityTeamGate(event, 'community.delete')

  const result = await callControlPlane<{
    ok: boolean
    communityId: string
    status: 'disabled'
    runtimeUserIds: string[]
    members: { total: number, removed: number, failed: number, complete: boolean }
  }>(
    event,
    '/api/control/community/delete',
    { jwt, communityId },
  )

  for (const runtimeUserId of result.runtimeUserIds) {
    // Erst merken, dann einziehen — der Rollen-Resolver cacht 30 s, und ohne
    // die Notiz vergäbe die Label-Middleware das Publikum beim nächsten
    // Request sofort wieder (siehe communityJoin.ts).
    rememberCommunityAccessRevoked(communityId, runtimeUserId)
    await revokeCommunityLabel(event, communityId, runtimeUserId)
  }

  return { ok: result.ok, communityId: result.communityId, status: result.status, members: result.members }
})

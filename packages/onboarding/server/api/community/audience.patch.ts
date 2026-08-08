import { z } from 'zod'
import { COMMUNITY_AUDIENCES } from '../../../../core/shared/communityAudience'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'

/**
 * Die Sichtbarkeit DIESER Community umschalten (C18, Davids Entscheidung vom
 * 2026-07-30). Aufrufer ist das Kunden-Dashboard auf dem Mandanten-Host
 * (/dashboard/community).
 *
 * ZWEI SCHRITTE, ZWEI PROJEKTE — dasselbe Muster wie „Zugang entziehen" (A5):
 *  1. Das Control Plane schreibt `communities.audience` (seine Tabelle).
 *  2. DIESE Route zieht den BESTAND um: alle veröffentlichten Zeilen dieser
 *     Community bekommen das neue Leserecht (`read(any)` ⇄
 *     `read(label:<communityId>)`). Die Zeilen liegen im RUNTIME-Projekt, und
 *     nur die Runtime hat dafür einen Schlüssel.
 *
 * REIHENFOLGE IST ABSICHT, und zwar in beide Richtungen dieselbe: erst die
 * Entscheidung (das Control Plane darf ablehnen — fehlende Rolle, fremde Id),
 * dann der Umzug. Umgekehrt hätte eine abgelehnte Änderung den Bestand schon
 * angefasst.
 *
 * FAIL-LOUD, aber nicht fail-500: der Umzug meldet Zahlen zurück
 * (`repermission`), und der Aufrufer sieht, ob etwas offen blieb. Der Vorgang
 * ist idempotent — ein erneutes Umschalten auf DASSELBE Publikum setzt ihn
 * fort, statt von vorn zu beginnen. Deshalb braucht es keinen eigenen
 * „Resume"-Endpunkt: der Schalter selbst ist der Resume.
 *
 * WAS DER SCHALTER SONST NOCH BEWIRKT (und was NICHT hier steht): noindex,
 * leere sitemap, gesperrtes Vorschaubild. Die hängen alle am aufgelösten
 * Tenant-Kontext und greifen von selbst, sobald der Resolver-Cache abgelaufen
 * ist (≤30 s) — es gibt dafür nichts zu schreiben.
 */
const bodySchema = z.object({ audience: z.enum(COMMUNITY_AUDIENCES) }).strict()

export default defineEventHandler(async (event) => {
  await requireCommunityPermission(event, 'team.manage')

  // Ohne Mandanten-Kontext gibt es keine Community, deren Sichtbarkeit man
  // wählen könnte (Silo-App, Kontroll-Host, Single-Tenant). 404 wie eine
  // fehlende Route — dort regelt die Sichtbarkeit die Instanz.
  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  const body = await readValidatedBody(event, bodySchema.parse)
  const jwt = await mintRuntimeJwt(event)

  // communityId kommt aus dem SERVER-Kontext (Host-Auflösung), nie aus dem Body.
  const written = await callControlPlane<{ communityId: string, audience: 'members' | 'public' }>(
    event,
    '/api/control/community/audience',
    { jwt, communityId: tenant.communityId, audience: body.audience },
  )

  // Der Bestand. `written.audience` statt `body.audience`: geschrieben ist,
  // was das Control Plane bestätigt — und der Tenant-Kontext DIESES Requests
  // trägt noch das alte Publikum (Resolver-Cache), taugt also nicht als Ziel.
  const repermission = await repermissionCommunityRows(event, { audience: written.audience })

  return { audience: written.audience, repermission }
})

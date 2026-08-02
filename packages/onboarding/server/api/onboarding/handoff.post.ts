import { z } from 'zod'
// Cross-Layer als EXPLIZITER Vertrag (A14): der Umschlag gehört dem Control
// Plane — reiner Typ-Import, kein Laufzeit-Coupling.
import type { MyCommunitiesResponse } from '../../../../control/shared/myCommunities'
import { deriveHandoffKey, sealHandoffToken } from '../../../../core/server/utils/embedHandoff'
import { sessionCookieName } from '../../../../core/server/lib/appwrite'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'

/**
 * Siegelt die laufende Session für den Sprung auf den Community-Host
 * (O6, Schritt 9 — Gegenstück zu GET /api/auth/site-session).
 *
 * Wird beim KLICK gerufen, nicht beim Seitenaufbau: das Token lebt 60 Sekunden,
 * ein beim Rendern erzeugtes wäre bei einem langsamen Leser längst tot.
 *
 * ── DER ZIEL-HOST KOMMT VON HIER, NICHT VOM AUFRUFER ──────────────────────
 * Sicherheits-Audit 2026-08-02 (KRITISCH, Kontoübernahme). Vorher gab diese
 * Route nur ein Token heraus, das an KEINEN Host gebunden war, und die Seite
 * `/start/done` baute das Ziel aus `?host=` zusammen. Wer ein Opfer dazu
 * brachte, `…/start/done?host=angreifer.example` zu öffnen und dort zu
 * klicken, bekam dessen frisches Siegel in die eigene Query geliefert und
 * konnte es binnen 60 s gegen einen ECHTEN Pukalani-Host einlösen — der setzte
 * ihm daraufhin das Session-Cookie des Opfers.
 *
 * Beide Hälften sind jetzt zu:
 *  (a) Das Siegel trägt seinen Ziel-Host (`sealHandoffToken(..., host)`), und
 *      `/api/auth/site-session` löst es nur ein, wenn es der eigene ist.
 *  (b) Der Host kommt aus der MITGLIEDSCHAFTS-Liste des Nutzers (dieselbe
 *      Quelle wie „Deine Communities"), nie aus dem Body. Damit ist die
 *      Zugehörigkeit serverseitig belegt, BEVOR ein Siegel entsteht — und die
 *      Seite kann gar keinen fremden Host mehr in den Link schreiben, weil sie
 *      ihn von hier bekommt.
 *
 * Der Preis ist ein Ruf ins Control Plane pro Klick (JWT + zwei Tabellen).
 * Das ist derselbe Aufwand wie `/api/onboarding/communities` und deshalb im
 * selben Rate-Limit-Budget — ein Klick pro Sprung, kein heißer Pfad.
 */
const bodySchema = z.object({
  /** Für WELCHE Community gesiegelt wird — Pflicht, denn daraus kommt das Ziel. */
  communityId: z.string().trim().min(1).max(36),
}).strict()

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const body = await readValidatedBody(event, bodySchema.parse)

  const secret = getCookie(event, sessionCookieName(event))
  if (!secret) {
    // Kein Cookie trotz Session-Kontext: dann käme ein Token heraus, das nichts
    // öffnet — lieber ehrlich 401 als ein Link, der beim Kunden scheitert.
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  // Die EINE vertrauenswürdige Quelle: was das Control Plane für die Identität
  // aus dem JWT als Mitgliedschaften kennt. Enthält bewusst weder stillgelegte
  // noch (für Mitleser) abuse-gesperrte Communities — wohin die Übersicht nicht
  // verlinkt, dorthin siegelt auch niemand.
  const jwt = await mintRuntimeJwt(event)
  const { communities } = await callControlPlane<MyCommunitiesResponse>(event, '/api/control/community/mine', { jwt })
  const community = communities.find(entry => entry.communityId === body.communityId)
  if (!community?.host) {
    logEvent('warn', 'onboarding.handoff_rejected', {
      communityId: body.communityId,
      userId: event.context.user.$id,
    })
    throw createError({ status: 403, statusText: 'Not a member of this community' })
  }

  const config = useRuntimeConfig(event)
  logEvent('info', 'onboarding.handoff_issued', {
    communityId: community.communityId,
    host: community.host,
    userId: event.context.user.$id,
  })
  return {
    token: sealHandoffToken(secret, deriveHandoffKey(config.appwriteKey), community.host),
    // Der Aufrufer baut sein Ziel aus DIESEM Host — nicht aus der eigenen URL.
    host: community.host,
  }
})

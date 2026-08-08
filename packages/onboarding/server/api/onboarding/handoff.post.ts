import { z } from 'zod'
import { sealCommunityHandoff, type SealedCommunityHandoff } from '../../utils/communityHandoff'

/**
 * Siegelt die laufende Session für den Sprung auf den Community-Host
 * (O6, Schritt 9 — Gegenstück zu GET /api/auth/site-session).
 *
 * Wird beim KLICK gerufen, nicht beim Seitenaufbau: das Token lebt 60 Sekunden,
 * ein beim Rendern erzeugtes wäre bei einem langsamen Leser längst tot.
 *
 * DIESE ROUTE IST DIE HÄLFTE DES KUNDENBEREICHS (`my.*`, Kontroll-Host): sie
 * lebt unter `/api/onboarding/`, das in `pukalani.tenancy.controlApiPrefixes`
 * steht, und ist damit genau dort erreichbar. Der Community-Switcher im
 * Dashboard hat sein eigenes Gegenstück auf den MANDANTEN-Hosts
 * (`POST /api/community/switch`, F50) — dieselbe Mechanik, engere Auswahl.
 *
 * DER GESAMTE SICHERHEITSKERN (Ziel-Host aus der Mitgliedschaftsliste, Siegel
 * an den Host gebunden, Audit 2026-08-02) LIEGT IN
 * `server/utils/communityHandoff.ts` — eine Fassung für beide Aufrufer. Hier
 * bleibt nur die Bindung an DIESEN Host und die Form des Bodys.
 *
 * KEIN Rollen-Filter: der Kundenbereich zeigt ALLE Mitgliedschaften (auch
 * `viewer`), also darf er auch in alle springen. Was die Übersicht verlinkt,
 * muss sie öffnen können.
 */
const bodySchema = z.object({
  /** Für WELCHE Community gesiegelt wird — Pflicht, denn daraus kommt das Ziel. */
  communityId: z.string().trim().min(1).max(36),
}).strict()

export default defineEventHandler(async (event): Promise<SealedCommunityHandoff> => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const body = await readValidatedBody(event, bodySchema.parse)
  return await sealCommunityHandoff(event, body.communityId)
})

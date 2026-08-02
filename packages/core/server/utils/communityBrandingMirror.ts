import type { H3Event } from 'h3'
import { COMMUNITY_BRANDING_TABLE, type CommunityBrandingValues } from '../../shared/communityBranding'

/** Appwrite-404 („Row not found") — alles andere ist ein echter Fehler. */
function isRowNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 404
}

/**
 * Spiegelt die Farbwahl EINER Community ins RUNTIME-Projekt (D6) — damit
 * offene Fenster sie ohne Reload übernehmen. Der Vertrag samt Begründung steht
 * in `core/shared/communityBranding.ts`.
 *
 * AUFRUFEN NACH dem Schreiben, mit dem, was das Control Plane BESTÄTIGT hat —
 * nie mit dem Request-Body: gespiegelt wird der gespeicherte Zustand, nicht
 * der gewünschte. Der einzige Aufrufer ist heute
 * `PATCH /api/community/branding` (onboarding-Layer).
 *
 * WARUM ADMIN-CLIENT UND NICHT `tenantDb()`: das hier ist keine Nutzerzeile
 * eines Mandanten, sondern eine INFRASTRUKTUR-Zeile über einen Mandanten —
 * ihre rowId IST die Community. `tenantDb().create` würde sie zusätzlich
 * stempeln, mit Row-Permissions versehen (die Tabelle ist bewusst table-weit
 * `read(any)`) und über die Türklinke 'member' einen Beitritt auslösen (A5).
 * Der Aufruf steht in `server/utils/**`, nicht in `server/api/**` — die
 * ESLint-Regel gegen rohes `.tablesDB` zielt auf Request-Routen und trifft
 * diese Stelle nicht.
 *
 * KEIN `upsertRow` — UPDATE, SONST CREATE. Das ist der ganze Grund, warum es
 * diese Tabelle gibt, und es wäre beinahe still gescheitert (live erwischt am
 * 2026-08-01): Appwrite 1.9.6 schreibt bei `upsertRow` die Zeile korrekt,
 * PUBLIZIERT dafür aber KEIN Realtime-Event. Der Spiegel stand also richtig da
 * und kein Browser erfuhr davon — der Spiegel wäre eine teure Attrappe
 * gewesen. `updateRow` (und `createRow` beim ersten Mal) feuert. Wer hier je
 * auf „ein Aufruf statt zwei" vereinfacht, nimmt dem Feature die Wirkung.
 *
 * FAIL-SOFT, UND ZWAR ABSICHTLICH: der Spiegel ist Bequemlichkeit. Ein
 * fehlgeschlagener Schreibvorgang darf ein erfolgreiches Umfärben nie zum
 * Fehler machen — die Wahrheit steht im Control Plane und der nächste
 * Seitenaufbau (≤30 s Resolver-Cache) zeigt sie ohnehin. Deshalb: warnen,
 * weitergehen. Apps ohne die Tabelle (Silo-Instanzen, die system-028 nicht
 * gefahren haben) landen genau hier und verhalten sich wie vorher.
 */
export async function mirrorCommunityBranding(
  event: H3Event,
  input: { communityId: string } & CommunityBrandingValues,
): Promise<void> {
  if (!input.communityId) return
  try {
    const config = useRuntimeConfig(event)
    const admin = createAdminClient(event)
    // Immer alle drei Felder: eine ausgelassene Spalte hiesse im Spiegel
    // „unverändert", und der Leser setzt den State als Ganzes.
    const data = { theme: input.theme, variant: input.variant, neutral: input.neutral }
    const target = {
      databaseId: config.public.appwriteDatabaseId,
      tableId: COMMUNITY_BRANDING_TABLE,
      rowId: input.communityId,
    }
    try {
      await admin.tablesDB.updateRow({ ...target, data })
    }
    catch (error) {
      // 404 = erste Farbwahl dieser Community, die Zeile gibt es noch nicht.
      // Jeder andere Fehler gehört in den fail-soft-Zweig unten.
      if (!isRowNotFound(error)) throw error
      await admin.tablesDB.createRow({ ...target, data })
    }
  }
  catch (error) {
    logEvent('warn', 'community.branding_mirror_failed', {
      communityId: input.communityId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

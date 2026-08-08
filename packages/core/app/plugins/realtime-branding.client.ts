import type { AppwriteRow } from '../../shared/types/appwrite'
import {
  COMMUNITY_BRANDING_TABLE,
  mirrorBelongsToCommunity,
  mirrorRowToBranding,
} from '../../shared/communityBranding'

/** Die Spiegel-Row, wie das Realtime-Event sie liefert (system-028). */
type CommunityBrandingRow = AppwriteRow & {
  theme?: string | null
  variant?: string | null
  neutral?: string | null
}

/**
 * Propagiert die Farbwahl EINER Community live an alle offenen Fenster (D6,
 * 2026-08-01) — der letzte Fall, der bis dahin einen Reload brauchte.
 *
 * Setzt der Owner unter /dashboard/community/branding ein anderes Theme, spiegelt die
 * PATCH-Route den bestätigten Zustand in die Runtime-Tabelle
 * `community_branding` (Vertrag + Begründung: core/shared/communityBranding.ts).
 * Dieses Plugin abonniert GENAU DIE EINE Row dieses Hosts und schreibt sie in
 * `useTenantBranding()`. Alles Weitere passiert von selbst: `useTheme()`
 * rechnet die Vorrangregel neu (`resolveThemeSelection`/`resolveNeutralSelection`,
 * B5 — auf einem Mandanten-Host gewinnt die Community), der Head-Getter im
 * theme-Plugin zieht `data-theme`/`data-variant`/`data-neutral` und die
 * Theme-CSS-Datei nach. Kein Reload, kein Hinweis-Banner.
 *
 * NUR AUF DEM BETROFFENEN MANDANTEN-HOST: ohne Community-Id (`useSiteId()`,
 * Kontroll-Host/Silo/Playground) und ohne Mandanten-Branding im Payload
 * abonniert das Plugin GAR NICHTS — dort gehört die Optik der Instanz bzw.
 * dem Besucher, und ein Spiegel-Event dürfte daran nichts ändern. Die
 * Row-Subscription liefert ohnehin nur die eigene Zeile; `where` ist das Netz
 * (dieselbe Bauart wie der tenantId-Filter bei Presence/Activity/Glocke).
 *
 * WAS BEWUSST NICHT MITMORPHT: `themeSettings.defaultThemeId` — daraus zieht
 * das theme-Plugin Tab-Farbe (`theme-color`), Favicon und die Adresse der
 * Vorschau-Karte (og:image). Der Wert kommt aus `/api/themes`, wo der Server
 * die Mandanten-Wahl schon eingesetzt hat; ihn hier nachzuziehen würde die
 * INSTANZ-Voreinstellung im Tab überschreiben und wäre beim Zurücksetzen auf
 * '' („keine eigene Wahl") nicht mehr rückrechenbar. Diese drei Dinge sind
 * gecachte Artefakte, die am Farb-Schlüssel hängen — sie folgen beim nächsten
 * Seitenaufbau. Aus demselben Grund zeigt ein Zurücksetzen auf '' live noch
 * die alte Farbe: der Client kennt die Instanz-Voreinstellung dann nicht mehr.
 *
 * Client-only, app-weit (detached EffectScope) — Muster wie
 * realtime-config.client.ts.
 */
export default defineNuxtPlugin(() => {
  const communityId = useSiteId().value
  if (!communityId) return

  const { branding } = useTenantBranding()
  // Kein Mandanten-Branding im Payload = kein Mandanten-Host: dort ist die
  // Farbwelt Sache der Instanz/des Besuchers, und ein Spiegel-Event hätte
  // keinen Platz, an den es gehört.
  if (!branding.value) return

  const config = useRuntimeConfig()
  const scope = effectScope(true)
  scope.run(() => {
    useRealtimeRows<CommunityBrandingRow>(
      config.public.appwriteDatabaseId,
      COMMUNITY_BRANDING_TABLE,
      (event) => {
        // 'delete' = der Spiegel wurde abgeräumt, nicht die Wahl aufgehoben.
        // Nichts zu tun: die Wahrheit liegt im Control Plane, der nächste
        // Seitenaufbau bringt sie.
        if (event.type === 'delete') return
        branding.value = mirrorRowToBranding(event.payload)
      },
      {
        rowId: communityId,
        where: payload => mirrorBelongsToCommunity(payload, communityId),
      },
    )
  })
})

import { effectiveScriptId, isPlausibleScriptId } from '../../../../core/shared/analyticsScript'
import { ANALYTICS_SETTINGS_TABLE, type AnalyticsConfigResponse, type AnalyticsSettingsRow } from '../../../shared/types/analytics'

/**
 * Die Script-Id DIESES Hosts — öffentlich, weil das Head-Plugin sie bei jedem
 * Seitenaufbau braucht, auch für Gäste (core/app/plugins/analytics.ts).
 *
 * Verraten wird dabei nichts, was nicht ohnehin im Quelltext jeder Seite
 * steht: die Id landet dort als `<script src>`.
 *
 * OPERATOR-KLINKE (`as: 'operator'`): der Leser ist meist ein GAST und hat
 * keine Session — mit dem Session-Client käme nie eine Zeile zurück. Die Row
 * bekommt deshalb bewusst KEIN öffentliches Leserecht; die Mandanten-Grenze
 * zieht allein die Datentür (`find` scopt im Pool auf `communityId`).
 * `actor: 'operator'` ist hier keine Aussage über einen Handelnden, sondern
 * die Wahrheit: es handelt niemand, es wird gelesen.
 *
 * FAIL-SOFT IN JEDEM ZWEIG: eine kaputte Statistik-Einstellung darf keine
 * Seite kosten. Jeder Fehler ⇒ leere Antwort ⇒ es wird kein Script eingebunden.
 */
const EMPTY: AnalyticsConfigResponse = { scriptId: '', ownScriptId: '', enabled: false }

interface TenancyProductsConfig {
  quota?: { plans?: Record<string, unknown> }
  products?: Record<string, string | undefined>
}

interface AnalyticsAppConfig {
  shared?: { scriptId?: string, siteId?: string }
}

export default defineEventHandler(async (event): Promise<AnalyticsConfigResponse> => {
  /**
   * KONTROLL-HOST: dort gibt es keinen Mandanten, und genau deshalb würde die
   * Datentür hier NICHT scopen — `find` gäbe die erste beste Zeile des
   * Pool-Projekts zurück, also die Script-Id einer fremden Community. Der
   * Kundenbereich misst nichts; die Antwort ist leer.
   */
  if (event.context.controlCenter) return EMPTY

  const cached = readAnalyticsConfigCache(event)
  if (cached) return cached

  try {
    /**
     * TARIF-Gate als LESE-Variante (P4): `requirePlanProduct` würde 404
     * werfen — richtig für einen Einstiegspunkt, falsch hier. Diese Route
     * beantwortet auf JEDER Seite die Frage „wird gemessen?", und die Antwort
     * für eine Community ohne das Produkt lautet schlicht „nein". Ein 404 wäre
     * ein Fehler im Log für einen erwarteten Normalfall.
     */
    const appConfig = useAppConfig() as {
      pukalani?: { tenancy?: TenancyProductsConfig, analytics?: AnalyticsAppConfig }
    }
    const tenant = useTenant(event)
    if (tenant?.mode === 'pool') {
      const tenancy = appConfig.pukalani?.tenancy
      const planOrder = Object.keys(tenancy?.quota?.plans ?? {})
      if (!planAllowsProduct(planOrder, tenancy?.products, tenant.plan, 'analytics')) {
        writeAnalyticsConfigCache(event, EMPTY)
        return EMPTY
      }
    }

    const db = tenantDb(event, { as: 'operator', actor: 'operator' })
    const row = await db.find<AnalyticsSettingsRow>(ANALYTICS_SETTINGS_TABLE)

    /**
     * DIE EINE AUFLÖSUNGSREGEL (v2): eigene Site schlägt Schalter schlägt
     * nichts — gerechnet in core/shared/analyticsScript.ts, damit Head,
     * Dashboard-Vorschau und Statistik gar nicht auseinanderlaufen KÖNNEN.
     *
     * Die Regel prüft die Form beider Ids gleich mit (zweite Prüfung beim
     * LESEN, nicht nur beim Schreiben): stünde in der Zeile je ein Wert aus
     * einer anderen Zeit — Migration, Konsole, Hand —, ginge er sonst ungeprüft
     * in den Head.
     */
    const shared = appConfig.pukalani?.analytics?.shared ?? {}
    const ownScriptId = row?.plausibleScriptId ?? ''
    const response: AnalyticsConfigResponse = {
      scriptId: effectiveScriptId(row, shared),
      ownScriptId: isPlausibleScriptId(ownScriptId) ? ownScriptId : '',
      enabled: row?.enabled === true,
    }
    writeAnalyticsConfigCache(event, response)
    return response
  }
  catch {
    // BEWUSST NICHT gecacht: ein Aussetzer von Appwrite soll die Messung nicht
    // für eine Minute abschalten.
    return EMPTY
  }
})

import { effectiveScriptId, isPlausibleScriptId } from '../../../../core/shared/analyticsScript'
import { analyticsSettingsSchema } from '../../../schemas/analytics'
import { ANALYTICS_SETTINGS_TABLE, type AnalyticsConfigResponse, type AnalyticsSettingsRow } from '../../../shared/types/analytics'

/**
 * Messung an- oder abschalten (`enabled`, Sammel-Site) bzw. eine EIGENE
 * Plausible-Site setzen oder löschen (`plausibleScriptId`, '' = keine).
 *
 *  WER DARF: `community.analytics` — trägt der OWNER (communityAuthz.ts) und
 *  über ALL_CAPABILITIES der Operator-Admin (Silo-Weg). Dieselbe Begründung
 *  wie bei `community.embed` (F37): wer hier etwas einträgt, lädt fremden Code
 *  in JEDE Seite seiner Community und schickt die Besuche seiner Mitglieder an
 *  einen Dritten. Das bindet die Community nach außen — Owner-Klasse, nicht
 *  Admin-Klasse.
 *
 *  DANN erst das Tarif-Gate: `requirePlanProduct` antwortet 404, wenn der Plan
 *  dieser Community das Produkt nicht enthält. Reihenfolge mit Absicht — wer
 *  gar nicht darf, soll nicht erfahren, ob er es mit einem anderen Tarif
 *  dürfte.
 *
 *  WER HANDELT: `actor: 'operator'`, und das ist hier KEIN Versehen. Das ist
 *  eine OWNER-EINSTELLUNG, kein Inhalt:
 *   - M13 — die Zahlungssperre friert Inhalte ein, nicht die Einstellungen
 *     des Owners. Eine Community mit Zahlungsverzug soll ihre Statistik
 *     abschalten können; sie aus der eigenen Verwaltung auszusperren, war nie
 *     der Zweck der Sperre.
 *   - A5 — eine Einstellung zu speichern ist kein Mitmachen. Wer hier
 *     schreibt, IST längst Mitglied (Owner); ein Beitritts-Auslöser wäre
 *     sinnlos, aber nicht harmlos, weil er dieselbe Tatsache ein zweites Mal
 *     behauptet.
 *  Die Klinke `as: 'operator'` braucht es ohnehin: die Zeile trägt keine
 *  User-Schreibrechte (sie gehört der Community, nicht einer Person).
 */
interface AnalyticsAppConfig {
  shared?: { scriptId?: string, siteId?: string }
}

export default defineEventHandler(async (event): Promise<AnalyticsConfigResponse> => {
  await requireCommunityPermission(event, 'community.analytics')
  requirePlanProduct(event, 'analytics')

  const body = await readValidatedBody(event, analyticsSettingsSchema.parse)

  const db = tenantDb(event, { as: 'operator', actor: 'operator' })

  /**
   * EINE Zeile je Mandant: suchen, dann ändern — sonst anlegen. Die Suche
   * läuft durch die Datentür und ist damit gescopt; ein `create` stempelt die
   * `communityId` selbst (aus dem Body wäre sie nie akzeptiert worden,
   * stripTenantKey entfernt sie). Der Unique-Index `uq_community` ist das Netz
   * darunter, falls zwei Anfragen gleichzeitig „keine Zeile" sehen.
   */
  const existing = await db.find<AnalyticsSettingsRow>(ANALYTICS_SETTINGS_TABLE)

  /**
   * NUR SCHREIBEN, WAS MITKAM (v2): das Schema lässt beide Felder weg, und ein
   * fehlendes Feld heißt „nicht angefasst". Deshalb wird der Änderungssatz hier
   * aus dem Body ZUSAMMENGESETZT statt aus ihm abgeschrieben — Begründung im
   * Schema (schemas/analytics.ts): sonst löschte ein Schalter-Klick aus einem
   * älteren Client-Bundle die eigene Script-Id.
   *
   * Beim ANLEGEN müssen dagegen beide Spalten stehen: die Zeile gibt es noch
   * nicht, „nicht angefasst" hat also keinen Bezugspunkt. Was fehlt, bekommt
   * den Aus-Zustand — also genau das, was die Community vorher hatte.
   */
  const patch: Partial<Pick<AnalyticsSettingsRow, 'plausibleScriptId' | 'enabled'>> = {}
  if (body.plausibleScriptId !== undefined) patch.plausibleScriptId = body.plausibleScriptId
  if (body.enabled !== undefined) patch.enabled = body.enabled

  const row = existing
    ? await db.update<AnalyticsSettingsRow>(ANALYTICS_SETTINGS_TABLE, existing.$id, patch)
    : await db.create<AnalyticsSettingsRow>(ANALYTICS_SETTINGS_TABLE, {
        plausibleScriptId: patch.plausibleScriptId ?? '',
        enabled: patch.enabled ?? false,
      })

  // Den Microcache DIESES Mandanten direkt auf den bestätigten Stand setzen
  // statt ihn zu leeren: der nächste Seitenaufbau soll die neue Id tragen, und
  // ein globales Leeren würde alle anderen Communities unnötig treffen.
  //
  // Gerechnet wird er mit derselben Regel wie in der Leseroute — die Antwort
  // eines Schreibvorgangs muss dasselbe sagen wie der nächste Seitenaufbau.
  const appConfig = useAppConfig() as { pukalani?: { analytics?: AnalyticsAppConfig } }
  const shared = appConfig.pukalani?.analytics?.shared ?? {}
  const response: AnalyticsConfigResponse = {
    scriptId: effectiveScriptId(row, shared),
    ownScriptId: isPlausibleScriptId(row.plausibleScriptId) ? row.plausibleScriptId : '',
    enabled: row.enabled === true,
  }
  writeAnalyticsConfigCache(event, response)

  // Die Zahlen des Mandanten kommen ab jetzt aus einer anderen Site (oder gar
  // nicht mehr) — der 120-s-Cache der Statistik hielte sonst die alte Antwort.
  clearAnalyticsStatsCache(event)
  return response
})

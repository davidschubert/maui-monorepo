import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { GUIDELINES_SLUG, PAGES_TABLE, type PageRow } from '../../shared/types/page'

/**
 * Die zwei Fragen, die vor jedem Rückfall auf die Regeln-Vorlage stehen. Sie
 * wohnen hier und nicht in `shared/guidelinesFallback.ts`, weil die eine die
 * App-Config und die andere die Datentür braucht; die Begründung für den
 * Rückfall selbst steht drüben.
 *
 * ── 1. DARF DIESE APP DAS ÜBERHAUPT? ───────────────────────────────────────
 * Der pages-Layer steckt in ZWEI Apps mit sehr verschiedenen Aufgaben: in
 * `platform` gehören die Seiten einer Community (dort ist „Regeln" ein
 * Discussions-Navigationspunkt), in `control` pflegt der BETREIBER seine
 * eigenen Rechtstexte. Ohne Schalter bekäme die Betreiber-Konsole eine
 * Vorlage für Community-Regeln in ihre Seiten-Liste und unter
 * `control.pukalani.app/guidelines` einen Text, der dort niemanden meint.
 *
 * Layer-Default AUS, App schaltet ein (Hausregel für Config-Gates). Der
 * Schalter sitzt bewusst NICHT beim Discussions-Produkt: `pages` darf `posts`
 * nicht kennen (A14), und eine Community darf ihre Regeln auch dann haben,
 * wenn sie den Feed nicht benutzt.
 *
 * ── 2. GIBT ES DIE ZEILE SCHON? ────────────────────────────────────────────
 * OHNE Status-Filter, und das ist der Punkt: gefragt ist nicht „gibt es eine
 * VERÖFFENTLICHTE Seite", sondern „gibt es überhaupt eine". Wer seine Regeln
 * bewusst auf Entwurf gestellt hat, hat sie zurückgezogen; ihm dann unsere
 * Vorlage unterzuschieben, wäre das Gegenteil dessen, was er getan hat. Die
 * öffentliche Route antwortet in diesem Fall wie bisher 404.
 *
 * Diese Abfrage läuft nur, wenn die Seite in der ohnehin geholten Liste FEHLT.
 * Sobald die Community ihre Regeln hat (Seed bei der Provisionierung oder
 * erstes Speichern), steht der slug in der Liste und sie findet nie wieder
 * statt — sie kostet also genau die Communities eine indizierte Abfrage, für
 * die dieses Paket gebaut ist, und hört von selbst auf, sobald sie geholfen
 * hat.
 */
export function guidelinesFallbackEnabled(): boolean {
  const appConfig = useAppConfig() as { pukalani?: { pages?: { guidelinesFallback?: boolean } } }
  return appConfig.pukalani?.pages?.guidelinesFallback === true
}

/**
 * Beide Fragen zusammen — der eine Aufruf für die öffentlichen Routen.
 * Türklinke `operator` wie die lesenden Nachbarn in diesem Layer: `pages`-Rows
 * tragen bewusst keine Row-Permissions.
 */
export async function guidelinesFallbackApplies(event: H3Event): Promise<boolean> {
  if (!guidelinesFallbackEnabled()) return false
  const row = await tenantDb(event, { as: 'operator' }).find<PageRow>(PAGES_TABLE, [
    Query.equal('slug', GUIDELINES_SLUG),
  ])
  return row === null
}

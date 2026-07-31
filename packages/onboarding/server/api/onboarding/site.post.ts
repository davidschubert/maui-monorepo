// Cross-Layer als EXPLIZITER Vertrag (A14): der Onboarding-Vertrag gehört dem
// Control Plane (es besitzt tenants/community_members) — dieser Layer konsumiert ihn,
// definiert ihn aber nicht. Reine Zod-/Daten-Module, kein Laufzeit-Coupling.
import { onboardingSiteSchema } from '../../../../control/schemas/onboarding'
import { callControlPlane, mintRuntimeJwt } from '../../utils/controlPlane'
// Der pages-Layer besitzt die Tabelle und stellt die Seed-Helfer bereit (A14).
import { seedHomePage } from '../../../../pages/server/utils/seedHomePage'
import { seedLegalPages } from '../../../../pages/server/utils/seedLegalPages'

/**
 * Community anlegen — der öffentliche Abschluss des Wizards (Schritt 7).
 *
 * Diese Route erzeugt selbst NICHTS: sie beweist die Session, mintet ein
 * kurzlebiges JWT und lässt das Control Plane anlegen. Damit bleibt genau eine
 * Stelle im System schreibberechtigt auf das Mandanten-Register.
 */
export interface CreatedSite {
  communityId: string
  host: string
  url: string
  plan: string
  trialEndsAt: string | null
  workspaceId: string
  tenantId: string
  reused: boolean
}

export default defineEventHandler(async (event) => {
  if (!event.context.user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }
  const site = await readValidatedBody(event, onboardingSiteSchema.parse)
  const jwt = await mintRuntimeJwt(event)

  const result = await callControlPlane<CreatedSite>(event, '/api/control/onboarding/site', { jwt, site })

  // Das Site-Label sofort, nicht erst beim ersten Besuch: der Wizard leitet
  // direkt auf den frischen Community-Host weiter, und dort soll der Gründer
  // ohne Umweg lesen können. Der Helfer lebt seit A4 in core (auto-import) und
  // wird ab jetzt zusätzlich von server/middleware/06.community-label.ts an JEDES
  // Mitglied vergeben — hier bleibt er, weil dieser Request auf dem
  // KONTROLL-Host läuft, wo es noch keinen Mandanten-Kontext gibt.
  await grantCommunityLabel(event, result.communityId)

  // Erste Startseite (Schritt 8). BEST EFFORT und bewusst nach der Anlage: die
  // Community existiert schon: an einer fehlgeschlagenen Seite darf sie nicht
  // scheitern. Der Owner sieht dann die Willkommens-Variante und kann selbst
  // eine anlegen — der Fehler steht im Log, nicht im Gesicht des Kunden.
  if (!result.reused) {
    await seedHomePage(event, {
      tenantId: result.tenantId,
      locale: site.locale ?? 'de',
      title: site.name,
      description: site.description,
      fallbackBody: site.locale === 'en'
        ? `Welcome to ${site.name}. This page is yours — edit it in the dashboard whenever you like.`
        : `Willkommen bei ${site.name}. Diese Seite gehört dir — du kannst sie im Dashboard jederzeit ändern.`,
    }).catch((error) => {
      logEvent('error', 'onboarding.home_page_failed', {
        communityId: result.communityId,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    })

    // Impressum + Datenschutz als VORLAGEN-ENTWÜRFE (Audit-Befund S7). Bewusst
    // unveröffentlicht: der Kunde ist Betreiber seiner Community, er muss die
    // Angaben selbst machen und selbst veröffentlichen — ein Rechtstext voller
    // Platzhalter darf nie öffentlich erreichbar sein. Best effort wie die
    // Startseite: die Community existiert schon, daran darf sie nicht scheitern.
    await seedLegalPages(event, {
      tenantId: result.tenantId,
      locale: site.locale ?? 'de',
    }).catch((error) => {
      logEvent('error', 'onboarding.legal_pages_failed', {
        communityId: result.communityId,
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    })
  }

  logEvent('info', 'onboarding.site_requested', {
    communityId: result.communityId,
    host: result.host,
    reused: result.reused,
  })
  return result
})

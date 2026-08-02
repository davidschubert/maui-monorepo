import { describe, expect, it } from 'vitest'
import { resolveSettingsTabs, type PukalaniSettingsTab } from '../shared/types/settings-tab'
import type { Capability } from '../shared/types/authz'

/**
 * Reiter-Registry der Einstellungs-Hülle (F24, 2026-08-02).
 *
 * Der Grund für diese Registry ist ein SCHNITT-Fehler, kein Anzeige-Wunsch:
 * `/dashboard/settings/community` lag im admin-Layer, rief aber ausschließlich
 * Routen des onboarding-Layers. Eine Silo-App ohne onboarding hatte den Reiter
 * damit im Bauplan und wurde nur zur LAUFZEIT davor bewahrt. Der wichtigste
 * Fall hier ist deshalb der letzte: OHNE Registrierung gibt es keinen Reiter,
 * egal wer zusieht und egal wo.
 */

const COMMUNITY_TAB: PukalaniSettingsTab = {
  id: 'community',
  scope: 'community',
  labelKey: 'dashboard.settings.community',
  icon: 'i-ph-users-three',
  to: '/dashboard/settings/community',
  requiredCapability: 'team.manage',
  order: 10,
}

const OPERATOR_TAB: PukalaniSettingsTab = {
  id: 'instanz',
  scope: 'operator',
  labelKey: 'x',
  icon: 'i-ph-gear',
  to: '/dashboard/settings/instanz',
  requiredCapability: 'system.manage',
}

/** Betrachter: erste Liste = Operator-Label, zweite = Rolle in DIESER Community. */
const viewer = (operator: Capability[], member: Capability[] = []) => ({
  canAsOperator: (c: Capability) => operator.includes(c),
  canAsMember: (c: Capability) => member.includes(c),
})

const owner = viewer([], ['team.manage', 'community.billing'])
const operator = viewer(['system.manage', 'team.manage'])

describe('resolveSettingsTabs', () => {
  it('ohne Registrierung gibt es keinen Reiter — der Silo-Fall', () => {
    // Das ist F24 in einer Zeile: eine App, die den onboarding-Layer nicht
    // extended, hat den Eintrag gar nicht erst. Kein Verstecken, kein
    // Laufzeit-Hinweis, nichts.
    expect(resolveSettingsTabs(undefined, { place: 'single-tenant', ...operator })).toEqual([])
    expect(resolveSettingsTabs([], { place: 'community', ...owner })).toEqual([])
  })

  it('zeigt den Community-Reiter dem Team auf dem Mandanten-Host', () => {
    expect(resolveSettingsTabs([COMMUNITY_TAB], { place: 'community', ...owner }).map(t => t.id))
      .toEqual(['community'])
  })

  it('hält ihn vom KONTROLL-Host fern — dort gibt es keine Community', () => {
    // apps/platform bedient Kontroll- UND Mandanten-Hosts aus derselben App:
    // die Registrierung allein darf den Reiter also nicht überall zeigen.
    expect(resolveSettingsTabs([COMMUNITY_TAB], { place: 'control', ...operator })).toEqual([])
  })

  it('lässt ihn im Einzelbetrieb stehen — dort trennt kein Ort die Ebenen', () => {
    expect(resolveSettingsTabs([COMMUNITY_TAB, OPERATOR_TAB], { place: 'single-tenant', ...operator }).map(t => t.id))
      .toEqual(['instanz', 'community'])
  })

  it('filtert nach Capability — ein Reiter ohne Recht ist ein Versprechen ins Leere', () => {
    const viewerOnly = viewer([], ['dashboard.access'])
    expect(resolveSettingsTabs([COMMUNITY_TAB], { place: 'community', ...viewerOnly })).toEqual([])
  })

  it('Betreiber-Reiter erreicht eine Community-Rolle nie, auch nicht im Einzelbetrieb', () => {
    // Dieselbe Trennung wie in moduleAllowedFor: `operator` zählt NUR das
    // globale Label. Sonst genügte eine schwache Capability am Reiter.
    const memberWithSystem = viewer([], ['system.manage'])
    expect(resolveSettingsTabs([OPERATOR_TAB], { place: 'single-tenant', ...memberWithSystem })).toEqual([])
  })

  it('erlaubt den Operator-Break-Glass auf einem Community-Reiter', () => {
    // Serverseitig ist er erlaubt und protokolliert — das Menü darf ihn nicht
    // verschweigen (gleiche Begründung wie bei den Modulen).
    expect(resolveSettingsTabs([COMMUNITY_TAB], { place: 'community', ...operator }).map(t => t.id))
      .toEqual(['community'])
  })

  it('sortiert nach order; ohne Angabe zuerst', () => {
    const spaet: PukalaniSettingsTab = { ...COMMUNITY_TAB, id: 'spaet', order: 90 }
    const ohne: PukalaniSettingsTab = { ...COMMUNITY_TAB, id: 'ohne', order: undefined }
    expect(resolveSettingsTabs([spaet, COMMUNITY_TAB, ohne], { place: 'community', ...owner }).map(t => t.id))
      .toEqual(['ohne', 'community', 'spaet'])
  })

  it('unbekanntes scope fällt heraus (fail-closed)', () => {
    // app.config.ts wird nicht gegen den Typ geprüft — ein vertipptes scope
    // darf keinen Reiter an einen beliebigen Ort legen.
    const kaputt = { ...COMMUNITY_TAB, scope: 'tenant' } as unknown as PukalaniSettingsTab
    expect(resolveSettingsTabs([kaputt], { place: 'community', ...owner })).toEqual([])
  })
})

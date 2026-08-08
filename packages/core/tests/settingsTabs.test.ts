import { describe, expect, it } from 'vitest'
import { resolveSettingsTabs, type PukalaniSettingsTab } from '../shared/types/settings-tab'
import type { Capability } from '../shared/types/authz'

/**
 * Reiter-Registry der Einstellungs-Hüllen (F24, 2026-08-02) — seit F51
 * (2026-08-07) lesen ZWEI Hüllen dieselbe pure Regel: die Konto-Hülle
 * (`pukalani.admin.settingsTabs`) und der Community-Hub
 * (`pukalani.admin.communityTabs`). Getestet wird die Regel, nicht die Liste.
 *
 * Der Grund für diese Registry ist ein SCHNITT-Fehler, kein Anzeige-Wunsch:
 * `/dashboard/settings/community` (heute `/dashboard/community`) lag im
 * admin-Layer, rief aber ausschließlich Routen des onboarding-Layers. Eine
 * Silo-App ohne onboarding hatte den Reiter damit im Bauplan und wurde nur zur
 * LAUFZEIT davor bewahrt. Der wichtigste Fall hier ist deshalb der erste: OHNE
 * Registrierung gibt es keinen Reiter, egal wer zusieht und egal wo.
 */

const COMMUNITY_TAB: PukalaniSettingsTab = {
  id: 'community',
  scope: 'community',
  labelKey: 'dashboard.settings.community',
  icon: 'i-ph-users-three',
  to: '/dashboard/community',
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

  it('die INSTANZ-Sicht ist im Silo da und auf einem Mandanten-Host weg (F51 Paket 2)', () => {
    // Davids Ebenen-Entscheidung in einer Zeile: „Silo zeigt die volle
    // Instanz-Sicht, System entfällt im Pool". Der admin-Layer meldet vier
    // Betreiber-Reiter am Community-Hub an (Konfiguration · Produkte ·
    // Speicher · System); dass sie auf dem Host einer Kunden-Community
    // verschwinden, leistet allein `scope: 'operator'` — es braucht dafür
    // KEINE zweite Regel in der Hülle.
    //
    // Der Betrachter ist hier bewusst der Betreiber MIT Community-Rolle: genau
    // der besucht im Pool den Host seines Kunden, und genau bei ihm dürfte ein
    // vergessener Ort-Filter auffallen.
    const instanz = { ...OPERATOR_TAB, id: 'instance-products', to: '/dashboard/admin/products', order: 90 }
    const beide = [COMMUNITY_TAB, instanz]
    const betreiber = viewer(['system.manage'], ['team.manage'])

    expect(resolveSettingsTabs(beide, { place: 'single-tenant', ...betreiber }).map(t => t.id))
      .toEqual(['community', 'instance-products'])
    expect(resolveSettingsTabs(beide, { place: 'community', ...betreiber }).map(t => t.id))
      .toEqual(['community'])
  })

  it('der Schalter der App hält die INSTANZ-Sicht aus Kundenbereich und Konsole heraus', () => {
    // `scope: 'operator'` allein reicht NICHT: an `place: 'control'`
    // (my.pukalani.app) und `place: 'single-tenant'` (apps/control, apps/photos)
    // bliebe die Instanz-Verwaltung unter der Überschrift
    // „Community-Einstellungen" stehen. Deshalb hängt jeder der vier Reiter an
    // `configFlag: 'admin.instanceTabs'` — Core-Default AUS, an nur in
    // apps/comments.
    const instanz: PukalaniSettingsTab = {
      ...OPERATOR_TAB,
      id: 'instance-products',
      configFlag: 'admin.instanceTabs',
    }
    const aus = { configOn: () => false }
    const an = { configOn: () => true }
    const betreiber = viewer(['system.manage'])

    for (const place of ['single-tenant', 'control'] as const) {
      expect(resolveSettingsTabs([instanz], { place, ...betreiber, ...aus })).toEqual([])
      expect(resolveSettingsTabs([instanz], { place, ...betreiber, ...an }).map(t => t.id))
        .toEqual(['instance-products'])
    }
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

/**
 * DIE DREI PRODUKT-GATES (F51, 2026-08-07).
 *
 * Sie stehen hier, weil der Community-Hub Sidebar-EINTRÄGE in Reiter verwandelt
 * hat (Aktivitätsprotokoll `productKey`+`planProduct`, Analytics `productKey`)
 * — ohne sie wäre der Umzug ein stiller Rechte-Verlust gewesen: ein Reiter für
 * ein Produkt, das der Betreiber abgeschaltet oder der Tarif nicht enthält.
 *
 * Geprüft wird auch die ASYMMETRIE, die aus `filterDashboardModules` übernommen
 * ist: `productOn` bekommt den (womöglich undefinierten) Schlüssel selbst und
 * entscheidet über ihn; `planOn`/`configOn` werden nur bei GESETZTEM Feld
 * gefragt. Wer das angleicht, blendet mit einer strengen `planOn` das halbe
 * Menü aus.
 */
describe('resolveSettingsTabs · Produkt-Gates', () => {
  const GATED: PukalaniSettingsTab = {
    ...COMMUNITY_TAB,
    id: 'activity',
    productKey: 'activity',
    planProduct: 'activity',
    configFlag: 'comments.embed.enabled',
  }
  const here = { place: 'community' as const, ...owner }

  it('lässt einen Reiter ohne Gates durch, auch wenn alle Prädikate streng sind', () => {
    expect(resolveSettingsTabs([COMMUNITY_TAB], {
      ...here,
      productOn: key => key === undefined,
      planOn: () => false,
      configOn: () => false,
    }).map(t => t.id)).toEqual(['community'])
  })

  it('zeigt den gegateten Reiter, wenn alle drei Gates offen sind', () => {
    expect(resolveSettingsTabs([GATED], {
      ...here,
      productOn: () => true,
      planOn: () => true,
      configOn: () => true,
    }).map(t => t.id)).toEqual(['activity'])
  })

  it('das Produkt ist vom Betreiber abgeschaltet ⇒ kein Reiter', () => {
    expect(resolveSettingsTabs([GATED], { ...here, productOn: () => false })).toEqual([])
  })

  it('der Tarif enthält das Produkt nicht ⇒ kein Reiter', () => {
    expect(resolveSettingsTabs([GATED], { ...here, planOn: () => false })).toEqual([])
  })

  it('die App hat das Produkt gar nicht gebaut ⇒ kein Reiter', () => {
    expect(resolveSettingsTabs([GATED], { ...here, configOn: () => false })).toEqual([])
  })

  it('ohne Prädikate zählt jedes Produkt als an — Verhalten wie vor F51', () => {
    expect(resolveSettingsTabs([GATED], here).map(t => t.id)).toEqual(['activity'])
  })

  it('planOn/configOn werden bei fehlendem Feld GAR NICHT gefragt', () => {
    // Das ist die Asymmetrie in einer Zeile: ein Reiter ohne `planProduct`
    // darf nie an einem Tarif-Prädikat hängenbleiben.
    const gefragt: string[] = []
    resolveSettingsTabs([COMMUNITY_TAB], {
      ...here,
      planOn: (key) => { gefragt.push(key); return false },
      configOn: (key) => { gefragt.push(key); return false },
    })
    expect(gefragt).toEqual([])
  })
})

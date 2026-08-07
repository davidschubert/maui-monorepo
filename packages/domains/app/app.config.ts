/**
 * `domains` meldet EINEN Reiter in der Einstellungs-Hülle an — die eigene
 * Domain dieser Silo-Site (control-036).
 *
 * WARUM DIESER LAYER, wie überall in dieser Registry: wer die Routen besitzt,
 * registriert den Einstieg. Die Seite lebt von `/api/site/domain/*`, und die
 * liegen hier. Eine App ohne `domains` bekommt damit keinen Reiter ins Leere —
 * das ist genau die Lehre aus F24 (der Community-Reiter war fest in der Hülle
 * verdrahtet und nur zur Laufzeit versteckt).
 *
 * ── `scope: 'operator'` UND NICHT `'community'` ───────────────────────────
 * Das ist die eine Entscheidung dieser Datei. Der Reiter der Pool-Fassung ist
 * `'community'` — dort gehört die Adresse dem MANDANTEN, und auf einem
 * Kontroll-Host soll er verschwinden. Hier gehört sie der SITE: es gibt keinen
 * Mandanten, und wer sie setzt, tut es als Betreiber dieser Installation.
 *
 * Praktisch macht es in einer Silo-App keinen Unterschied — mit
 * `tenancy.enabled: false` löst `resolveDashboardPlace()` auf
 * `'single-tenant'` auf, und dort ist JEDES scope sichtbar. Es macht aber den
 * BAUPLAN richtig: liefe dieser Layer je in einer Mehr-Mandanten-App mit,
 * hätte ein Community-Owner nichts mit ihm zu schaffen.
 *
 * `community.domain` ist bewusst dieselbe Capability wie im Pool — es ist
 * dieselbe Befugnis („darf die Adresse dieser Site bestimmen"), und ihr
 * Kommentar in `core/shared/authz.ts` nennt den Silo-Fall wörtlich. In einer
 * Silo-App trägt sie der Betreiber-Admin über sein globales Label.
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      settingsTabs: [
        {
          id: 'site-domain',
          scope: 'operator',
          labelKey: 'siteDomain.navLabel',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/settings/domain',
          requiredCapability: 'community.domain',
          order: 20,
        },
      ],
    },
  },
})

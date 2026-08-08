/**
 * `domains` meldet EINEN Reiter im Community-Hub an — die eigene Domain dieser
 * Silo-Site (control-036).
 *
 * Seit F51 (2026-08-07) steht er in `pukalani.admin.communityTabs`
 * (/dashboard/community/domain) statt in `settingsTabs`
 * (/dashboard/settings/domain): die Adresse einer Site ist keine
 * KONTO-Einstellung, und im Silo ist der Hub genau die Hülle, die es dafür
 * gibt. Die Pool-Fassung (`onboarding`) ist mit umgezogen — beide heißen
 * weiterhin gleich und kollidieren weiterhin nicht, weil keine App beide
 * Layer zieht (Begründung: nuxt.config.ts dieses Layers).
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
      communityTabs: [
        {
          id: 'site-domain',
          scope: 'operator',
          labelKey: 'siteDomain.navLabel',
          icon: 'i-ph-globe-hemisphere-west',
          to: '/dashboard/community/domain',
          requiredCapability: 'community.domain',
          order: 40,
        },
      ],
    },
  },
})

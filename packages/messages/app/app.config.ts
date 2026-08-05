/**
 * `messages` meldet seine Dashboard-Flächen bei den Registries des Cores an
 * (`pukalani.admin.modules` + `pukalani.admin.settingsTabs`, deep-merged) —
 * das Admin-Layout rendert sie capability-gefiltert (Layer-Grenze A14).
 *
 * DREI EINTRÄGE, DREI ZIELGRUPPEN — dasselbe Muster und derselbe Grund wie bei
 * posts (C16): eine Registrierung trägt genau EINE `requiredCapability`, und
 * die drei Gruppen überschneiden sich nicht.
 */
export default defineAppConfig({
  pukalani: {
    admin: {
      modules: [
        {
          /**
           * DER POSTEINGANG — für JEDES Mitglied.
           *
           * `dashboard.access` ist die Capability des VIEWERS, also der Rolle,
           * die jeder Beitritt vergibt. Das ist Absicht: EMPFANGEN geht ab
           * Vertrauensstufe 0 (Konzept § 2.4, Folge 1), und wer angeschrieben
           * wurde, muss seinen Posteingang öffnen können — sonst wäre die
           * erste Nachricht an ein junges Konto unzustellbar.
           *
           * Das Gate fürs ERÖFFNEN sitzt an der Route (`messages.write`), und
           * die Seite selbst blendet den Knopf entsprechend aus. Ein
           * Menüpunkt, den man erst ab TL1 sähe, wäre die falsche Grenze am
           * falschen Ort.
           */
          id: 'messages',
          scope: 'community',
          productKey: 'messages',
          // Tarif-Gate (C2/P4): im Pool ab Personal — dieselbe Zuordnung, die
          // `requirePlanProduct` an /api/messages durchsetzt.
          planProduct: 'messages',
          labelKey: 'messages.nav.inbox',
          icon: 'i-ph-envelope-simple',
          to: '/dashboard/messages',
          requiredCapability: 'dashboard.access',
          group: 'products',
          order: 5,
        },
        {
          /**
           * DIE MELDE-WARTESCHLANGE. Sie ist keine Kür, sondern die Bedingung
           * dafür, dass dieser Layer `targetType: 'message'` überhaupt
           * registrieren darf — ein meldbarer Typ ohne Warteschlange ist ein
           * „Versprechen ins Leere" (moderation/server/utils/reportTargets.ts).
           */
          id: 'messages-reports',
          scope: 'community',
          productKey: 'messages',
          planProduct: 'messages',
          labelKey: 'messages.nav.reports',
          icon: 'i-ph-flag-banner',
          to: '/dashboard/message-reports',
          requiredCapability: 'reports.moderate',
          group: 'settings',
          order: 25,
        },
      ],
      settingsTabs: [
        {
          /**
           * DER OWNER-SCHALTER (Konzept § 2.6, Davids Entscheidung 4).
           *
           * Als EINSTELLUNGS-REITER und nicht als eigener Menüpunkt: er wird
           * einmal gesetzt und danach nie wieder angefasst — genau das
           * unterscheidet eine Einstellung von einer Fläche. Dort steht schon
           * die Community-Verwaltung (onboarding registriert sie ebenso).
           */
          id: 'messages',
          scope: 'community',
          labelKey: 'messages.nav.settings',
          icon: 'i-ph-envelope-simple',
          to: '/dashboard/settings/messages',
          requiredCapability: 'messages.manage',
          order: 20,
        },
      ],
    },
  },
})

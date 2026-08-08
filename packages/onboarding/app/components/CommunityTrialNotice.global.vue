<script setup lang="ts">
import { trialNotice } from '../../../control/shared/onboarding'

/**
 * Der Hinweis auf die ablaufende Testphase (M13, letztes Stück des
 * Selbstbedienungs-Trichters).
 *
 * ORT: die Dashboard-Übersicht, platziert über die Registry
 * `pukalani.admin.notices` (core/shared/types/admin-notice.ts). GLOBAL
 * registriert (`.global.vue`), weil `<component :is="'CommunityTrialNotice'">`
 * einen Namen zur Laufzeit auflösen muss — dieselbe Regel wie bei den
 * Header-Utilities.
 *
 * WANN ER ETWAS SAGT, entscheidet EINE pure, unit-getestete Funktion
 * (`trialNotice`): die letzten 7 Tage vor dem Ende, und danach noch 14 Tage
 * lang die Feststellung, dass die Testphase vorbei ist und die Community jetzt
 * nur noch zum Lesen ist (F49, 2026-08-07). Danach schweigt er für immer —
 * `communities.trialEndsAt` wird beim Ablauf NICHT geräumt, ein ungebremster
 * Hinweis wäre also ein Dauer-Verkaufsbanner. Den ZUSTAND meldet ohnehin
 * dauerhaft der Sperr-Hinweis darüber (CommunitySuspensionNotice); dieser hier
 * meldet das EREIGNIS.
 *
 * NUR CLIENT (`server: false`): der Text hängt an `Date.now()`. Serverseitig
 * gerendert stünde im SSR-HTML eine andere Tageszahl als nach der Hydration —
 * derselbe Grund, aus dem die Übersicht ihr Datum erst in `onMounted` füllt.
 * Der Preis ist ein Nachrutschen um einen Frame; die Alternative wäre ein
 * Hydration-Bruch auf der meistbesuchten Dashboard-Seite.
 *
 * KEIN X ZUM WEGKLICKEN: ein Hinweis, der auf ein Datum zuläuft und sich von
 * selbst wieder abschaltet, braucht keinen Dauer-Schalter — und ein
 * weggeklickter Ablauf wäre genau die Überraschung, die er verhindern soll.
 * Wer ihn loswerden will, kauft oder wartet die 14 Tage ab.
 */
const { t } = useI18n()
const localePath = useLocalePath()

/**
 * 404 = kein Pool-Mandant (Kontroll-Host, Silo, Einzelbetrieb) → nichts zu
 * zeigen, und das ist kein Fehler. `default` fängt es ab, damit die Übersicht
 * keinen Fehler-Toast wegen einer Auskunft bekommt, die es dort gar nicht gibt.
 */
const { data } = await useFetch<{ trialEndsAt: string | null }>('/api/community/billing/trial', {
  lazy: true,
  server: false,
  default: () => ({ trialEndsAt: null }),
})

const notice = computed(() => trialNotice(data.value?.trialEndsAt, Date.now()))
</script>

<template>
  <UAlert
    v-if="notice"
    :color="notice.kind === 'ending' ? 'warning' : 'neutral'"
    variant="subtle"
    :icon="notice.kind === 'ending' ? 'i-ph-hourglass-medium' : 'i-ph-info'"
    :title="notice.kind === 'ending'
      ? t('onboarding.trial.endingTitle', notice.daysLeft)
      : t('onboarding.trial.endedTitle')"
    :description="notice.kind === 'ending'
      ? t('onboarding.trial.endingText')
      : t('onboarding.trial.endedText')"
    :actions="[{
      label: t('onboarding.trial.action'),
      color: 'neutral',
      variant: 'outline',
      to: localePath('/dashboard/settings/subscription'),
    }]"
    data-trial-notice
    :data-trial-kind="notice.kind"
    :data-trial-days-left="notice.daysLeft"
  />
</template>

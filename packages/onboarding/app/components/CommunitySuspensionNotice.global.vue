<script setup lang="ts">
/**
 * Der Hinweis auf die Sperre (M13, Davids Entscheidung vom 2026-08-02).
 *
 * ORT: die Dashboard-Übersicht, über die Registry `pukalani.admin.notices`
 * (core/shared/types/admin-notice.ts) — dieselbe Bauart wie der
 * Testphasen-Hinweis. GLOBAL registriert (`.global.vue`), weil
 * `<component :is="'CommunitySuspensionNotice'">` einen Namen zur Laufzeit
 * auflösen muss.
 *
 * REIHENFOLGE VOR DEM TRIAL-HINWEIS (`order: 5` vs. `10`): eine gesperrte
 * Community ist die dringlichere Nachricht. Seit F49 (2026-08-07) stehen beide
 * REGELMÄSSIG nebeneinander — das Ende der Testphase IST der häufigste Weg in
 * die billing-Sperre. Die Reihenfolge trennt sie sauber: hier steht der
 * Zustand („nur zum Lesen"), darunter das Ereignis („Testphase beendet").
 *
 * ES KANN HIER NUR 'billing' STEHEN. Eine wegen Missbrauch gesperrte Community
 * löst ihren Host nicht mehr auf: dort gibt es kein Dashboard, in dem ein
 * Banner hängen könnte. Der Owner erfährt DAVON im Kundenbereich
 * (my.pukalani.app) und per Mail. Trotzdem behandelt die Vorlage beide Fälle —
 * eine Komponente, die bei einem unerwarteten Wert nichts sagt, wäre der
 * schlechtere Fehler.
 *
 * KEIN X ZUM WEGKLICKEN, aus demselben Grund wie beim Testphasen-Hinweis: was
 * von selbst verschwindet, sobald die Zahlung ankommt, braucht keinen
 * Dauer-Schalter — und ein weggeklickter Hinweis wäre genau die Überraschung,
 * die er verhindern soll.
 *
 * NUR CLIENT (`server: false`): die Antwort hängt am Mandanten UND kostet im
 * Sperrfall einen Service-Ruf. Auf der meistbesuchten Dashboard-Seite hat das
 * im SSR-Pfad nichts verloren; der Preis ist ein Nachrutschen um einen Frame.
 */
const { t } = useI18n()
const localePath = useLocalePath()

/**
 * 404 = kein Pool-Mandant (Kontroll-Host, Silo, Einzelbetrieb) → nichts zu
 * zeigen, und das ist kein Fehler. `default` fängt es ab, damit die Übersicht
 * keinen Fehler-Toast wegen einer Auskunft bekommt, die es dort gar nicht gibt.
 */
const { data } = await useFetch<{ suspension: string, reason: string }>('/api/community/suspension', {
  lazy: true,
  server: false,
  default: () => ({ suspension: '', reason: '' }),
})

const kind = computed(() => data.value?.suspension ?? '')
const reason = computed(() => (data.value?.reason ?? '').trim())
</script>

<template>
  <UAlert
    v-if="kind"
    color="error"
    variant="subtle"
    icon="i-ph-lock-simple"
    :title="kind === 'abuse'
      ? t('onboarding.suspension.abuseTitle')
      : t('onboarding.suspension.billingTitle')"
    :description="reason || (kind === 'abuse'
      ? t('onboarding.suspension.abuseText')
      : t('onboarding.suspension.billingText'))"
    :actions="kind === 'billing'
      ? [{
        label: t('onboarding.suspension.action'),
        color: 'neutral' as const,
        variant: 'outline' as const,
        to: localePath('/dashboard/community/plan'),
      }]
      : []"
    data-suspension-notice
    :data-suspension-kind="kind"
  />
</template>

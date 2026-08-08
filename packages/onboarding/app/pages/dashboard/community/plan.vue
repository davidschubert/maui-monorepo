<script setup lang="ts">
import { TRIAL_PLAN, trialDaysLeft } from '../../../../../control/shared/onboarding'

/**
 * Abo & Rechnung EINER Community (A6 Schritt 3, Platform-Seite).
 *
 * WARUM HIER IM ONBOARDING-LAYER: die Seite kann nur so weit reichen wie ihre
 * Routen, und die liegen hier (`/api/community/billing/*`) — dieser Layer besitzt die
 * Service-Naht zum Control Plane, dem `tenants` und die Stripe-Schlüssel
 * gehören. Läge sie im admin- oder billing-Layer, hätte eine Silo-App einen
 * Menüpunkt, dessen Seite ins Leere greift (Muster: /dashboard/members).
 *
 * WARUM UNTER /dashboard/community/plan: die Seite ist seit F51 (2026-08-07)
 * der Reiter „Plan" des Community-Hubs und rendert wie ihre Geschwister Karten,
 * kein eigenes UDashboardPanel (Hülle: packages/admin/app/pages/dashboard/
 * community.vue). Der Pfad ist FEST verdrahtet und nicht nur Geschmack: die
 * Erfolgs-/Abbruch-URLs des Checkouts baut der SERVER aus `tenants.host`
 * (apps/control/server/utils/communityCheckout.ts) — wer ihn hier ändert, ändert
 * ihn dort mit, sonst landet der Kunde nach dem Bezahlen auf einer 404.
 * Alt-Pfad `/dashboard/settings/subscription` leitet 301 weiter
 * (routeRules in packages/onboarding/nuxt.config.ts) — Stripe-Sitzungen, die
 * über den Cutover hinweg offen waren, kommen so trotzdem an.
 *
 * `billing.manage` trägt nur der OWNER (Davids Entscheidung 2 vom 2026-07-30,
 * communityAuthz.ts). Die AUTORITÄT ist `requireCommunityTeamGate` auf den Routen und
 * das Control Plane dahinter; `requiredCapability` hier erspart nur den Weg zu
 * einer Seite, auf der jeder Knopf 403 gäbe.
 *
 * DREI KARTEN, EINE ARBEITSTEILUNG:
 *  1. Aktueller Plan — was gilt gerade.
 *  2. Plan wählen — der KAUF (nur aufwärts: personal/pro). Basic hat bewusst
 *     keinen Knopf: es ist seit F49 (2026-08-07) kein Angebot mehr, sondern der
 *     Zustand OHNE Abo — die Community ist dort nur zum Lesen. HERUNTER geht es
 *     über das Portal, weil Proration, Steuern und Fristen bei Stripe gerechnet
 *     werden. Zwei Wege zum selben Vertrag wären zwei Wahrheiten.
 *  3. Rechnungen & Zahlungsmethode — das Stripe-Portal.
 *
 * ── WAS DIE ERSTE KARTE SAGT (F51, Davids eigene Formulierung) ─────────────
 * Nicht der rohe Plan-Key, sondern der ZUSTAND:
 *   · laufende Testphase → „Testphase (Pro) – X Tage übrig"
 *   · kein Abo          → „Kein Abo – Free Plan" MIT dem Nur-lesen-Satz daneben
 *   · gekauft           → der Plan-Name wie bisher
 * Der Zusatz beim zweiten Fall ist keine Verzierung: „Free Plan" allein
 * verspräche einen funktionsfähigen Gratis-Tarif, den es seit F49 nicht gibt.
 * Das VERHALTEN ist unverändert — nur-lesend bis bezahlt (M13-Sperre) —, diese
 * Karte macht es nur an der Stelle sichtbar, an der man etwas dagegen tun kann.
 *
 * Die Tageszahl kommt aus DERSELBEN Quelle wie der Dashboard-Hinweis
 * (`GET /api/community/billing/trial` + die pure `trialDaysLeft`), nicht aus
 * einer zweiten Rechnung. Sie wird bewusst NUR im Browser geholt (`server:
 * false`): der Wert hängt an `Date.now()`, serverseitig gerendert stünde im
 * SSR-HTML eine andere Zahl als nach der Hydration (Begründung wie in
 * CommunityTrialNotice.global.vue).
 *
 * Die Preise stehen als i18n-Text da (nicht gerechnet): so bleibt die Schreibweise
 * pro Sprache richtig (29 € / €29). VERBINDLICH ist trotzdem nur, was der
 * Stripe-Checkout zeigt — inklusive Steuer nach Rechnungsadresse. Genau das sagt
 * der Hinweis unter dem aktuellen Plan.
 *
 * NACH DEM KAUF passiert hier NICHTS von selbst: die Zahlung bestätigt Stripe
 * per Webhook GEGEN DAS CONTROL PLANE, und `tenants.plan` liegt in einem
 * Projekt, das dieser Browser nicht lesen darf (keine Live-Propagation für
 * tenants — CLAUDE.md/D6). Der Erfolgs-Toast sagt deshalb „in Kürze" statt
 * einen neuen Plan zu behaupten.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'community.billing' })

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const router = useRouter()

useHead({ title: () => t('onboarding.subscription.title') })

/** null = kein Pool-Mandant (Silo, Kontroll-Host) → hier gibt es kein Abo. */
const { plan: currentPlan } = useTenantPlan()
const isTenantHost = computed(() => currentPlan.value !== null)

const PLAN_KEYS = ['basic', 'personal', 'pro'] as const
type PlanKey = (typeof PLAN_KEYS)[number]

/**
 * Anzahl der Stichpunkte je Plan. Die Texte sind i18n-ARRAYS und werden über
 * den Index adressiert (`…bullets.0`) — dasselbe Muster wie die FAQ-Liste im
 * marketing-Layer. Wer hier eine Zeile ergänzt, zählt diese Zahl mit hoch.
 */
const PLAN_BULLETS: Record<PlanKey, number> = { basic: 3, personal: 5, pro: 5 }

const yearly = ref(false)
const interval = computed<'monthly' | 'yearly'>(() => (yearly.value ? 'yearly' : 'monthly'))

/** Ein Knopf zur Zeit: 'personal' | 'pro' | 'portal' | '' */
const busy = ref('')

const isCurrent = (key: PlanKey) => currentPlan.value === key

function planName(key: string): string {
  // Ein unbekannter Plan-Key (Alt-Bestand) wird NICHT übersetzt erfunden,
  // sondern roh gezeigt — der Resolver normalisiert ihn ohnehin (tenantsResolver).
  return (PLAN_KEYS as readonly string[]).includes(key)
    ? t(`onboarding.subscription.plans.${key}.name`)
    : key
}

function planPrice(key: PlanKey): string {
  return yearly.value
    ? t(`onboarding.subscription.plans.${key}.priceYearly`)
    : t(`onboarding.subscription.plans.${key}.price`)
}

// ── Was in der ersten Karte steht (F51, Davids Formulierung) ────────────────

/**
 * 404 = kein Pool-Mandant → keine Testphase, und das ist kein Fehler
 * (dieselbe Behandlung wie in CommunityTrialNotice.global.vue). Nur im
 * Browser, weil die Tageszahl an `Date.now()` hängt.
 */
const { data: trial } = await useFetch<{ trialEndsAt: string | null }>('/api/community/billing/trial', {
  lazy: true,
  server: false,
  default: () => ({ trialEndsAt: null }),
})

/** Erst im Browser gesetzt — SSR darf keine Tageszahl behaupten. */
const now = ref(0)
onMounted(() => { now.value = Date.now() })

/** Verbleibende volle Tage, oder null wenn gerade keine Testphase läuft. */
const trialDays = computed<number | null>(() => {
  const end = trial.value?.trialEndsAt
  if (!end || !now.value) return null
  const parsed = Date.parse(end)
  if (!Number.isFinite(parsed) || parsed <= now.value) return null
  return trialDaysLeft(end, now.value)
})

/**
 * DREI ZUSTÄNDE, EIN LABEL. `basic` ist seit F49 kein Plan mehr, sondern die
 * Abwesenheit eines Abos — genau das muss dastehen, sonst liest sich der
 * Plan-Name „Basic" wie ein gebuchter Gratis-Tarif.
 */
const planLabel = computed(() => {
  if (trialDays.value !== null) {
    return t('onboarding.subscription.trialLabel', { plan: planName(TRIAL_PLAN), n: trialDays.value }, trialDays.value)
  }
  if (currentPlan.value === 'basic') return t('onboarding.subscription.noPlanLabel')
  return planName(currentPlan.value ?? '')
})

/** Der Nur-lesen-Satz steht NUR ohne Abo — bei laufender Testphase gilt er nicht. */
const showReadOnlyNote = computed(() => trialDays.value === null && currentPlan.value === 'basic')

async function buy(key: PlanKey) {
  // Basic hat keinen Checkout (kein Stripe-Price) — der Knopf existiert gar
  // nicht, diese Zeile ist der Typ-Beweis für den Body unten.
  if (key === 'basic' || busy.value) return
  busy.value = key
  try {
    const { url } = await $fetch<{ url: string }>('/api/community/billing/checkout', {
      method: 'POST',
      body: { plan: key, interval: interval.value },
    })
    window.location.href = url
  }
  catch (error) {
    // `data.reason` ist das EINE Feld des stabilen Fehler-Envelopes (core
    // shared/types/error.ts). 'already_subscribed' ist keine Panne, sondern die
    // Antwort auf „du hast schon eins" — und verdient einen eigenen Satz.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: reason === 'already_subscribed'
        ? t('onboarding.subscription.alreadySubscribed')
        : t('onboarding.subscription.errorGeneric'),
      // Beim Bezahlen ist „es wurde nichts berechnet" die eigentliche Auskunft;
      // beim schon bestehenden Abo steht der nächste Schritt im Titel.
      description: reason === 'already_subscribed' ? undefined : t('onboarding.subscription.checkoutErrorHint'),
      color: reason === 'already_subscribed' ? 'warning' : 'error',
    })
  }
  finally {
    busy.value = ''
  }
}

async function openPortal() {
  if (busy.value) return
  busy.value = 'portal'
  try {
    const { url } = await $fetch<{ url: string }>('/api/community/billing/portal', { method: 'POST' })
    window.location.href = url
  }
  catch (error) {
    // 409 = diese Community hat nie gekauft, es gibt also keinen Stripe-Customer
    // und kein Portal. Das ist ein Zustand, kein Fehler — deshalb neutral.
    const statusCode = (error as { statusCode?: number }).statusCode
    toast.add({
      title: statusCode === 409
        ? t('onboarding.subscription.noSubscription')
        : t('onboarding.subscription.errorGeneric'),
      description: statusCode === 409 ? undefined : t('onboarding.subscription.portalErrorHint'),
      color: statusCode === 409 ? 'neutral' : 'error',
    })
  }
  finally {
    busy.value = ''
  }
}

/**
 * Rückkehr aus dem Stripe-Checkout. Der Parameter wird nach dem Hinweis aus der
 * Adresse geräumt: sonst meldete jeder spätere Reload derselben URL noch einmal
 * einen Erfolg, den es längst gibt.
 */
onMounted(() => {
  const checkout = route.query.checkout
  if (checkout !== 'success' && checkout !== 'canceled') return
  toast.add(checkout === 'success'
    ? { title: t('onboarding.subscription.checkoutSuccess'), color: 'success' as const }
    : { title: t('onboarding.subscription.checkoutCanceled'), color: 'neutral' as const })
  void router.replace({ path: route.path })
})
</script>

<template>
  <UPageCard
    :title="t('onboarding.subscription.title')"
    :description="t('onboarding.subscription.help')"
    variant="subtle"
  >
    <UAlert
      v-if="!isTenantHost"
      color="neutral"
      variant="subtle"
      icon="i-ph-info"
      :title="t('onboarding.subscription.noTenantTitle')"
      :description="t('onboarding.subscription.noTenantText')"
    />

    <div v-else class="flex flex-wrap items-center justify-between gap-4" data-subscription-current>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-seal-check" class="mt-0.5 size-5 shrink-0 text-muted" />
        <div>
          <p class="text-sm font-medium">{{ t('onboarding.subscription.currentPlan') }}</p>
          <!-- Ohne Abo zuerst die FOLGE, dann der Preis-Hinweis: „Free Plan"
               allein verspräche einen Tarif, den es nicht gibt (F49/F51). -->
          <p v-if="showReadOnlyNote" class="text-sm text-warning" data-subscription-readonly>
            {{ t('onboarding.subscription.readOnlyNote') }}
          </p>
          <p class="text-sm text-muted">{{ t('onboarding.subscription.priceNote') }}</p>
        </div>
      </div>
      <UBadge
        :color="showReadOnlyNote ? 'warning' : 'primary'"
        variant="subtle"
        size="lg"
        data-subscription-plan
      >
        {{ planLabel }}
      </UBadge>
    </div>
  </UPageCard>

  <UPageCard
    v-if="isTenantHost"
    :title="t('onboarding.subscription.choosePlan')"
    :description="t('onboarding.subscription.chooseHelp')"
    variant="subtle"
  >
    <!-- Beide Zeiträume stehen als Text da; der Schalter trägt den Rabatt, damit
         niemand raten muss, was „an" bedeutet. -->
    <div class="flex flex-wrap items-center justify-between gap-3" data-subscription-interval>
      <div class="flex items-center gap-2 text-sm">
        <span :class="yearly ? 'text-muted' : 'font-medium text-default'">
          {{ t('onboarding.subscription.intervalMonthly') }}
        </span>
        <span class="text-muted" aria-hidden="true">·</span>
        <span :class="yearly ? 'font-medium text-default' : 'text-muted'">
          {{ t('onboarding.subscription.intervalYearly') }}
        </span>
      </div>
      <USwitch
        v-model="yearly"
        :label="t('onboarding.subscription.yearlyDiscount')"
        :aria-label="t('onboarding.subscription.intervalYearly')"
        data-subscription-yearly
      />
    </div>

    <!-- BEWUSST KEINE UTable (B6): Preiskarten, keine Datenliste — der Kunde
         vergleicht drei Angebote und wählt eines, er sortiert und blättert
         nicht. Dieselbe Darstellung wie auf der öffentlichen Preisseite. -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div
        v-for="key in PLAN_KEYS"
        :key="key"
        class="flex flex-col rounded-lg border p-4"
        :class="isCurrent(key) ? 'border-primary' : 'border-default'"
        :data-plan="key"
      >
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold">{{ t(`onboarding.subscription.plans.${key}.name`) }}</h3>
          <UBadge v-if="isCurrent(key)" color="primary" variant="subtle" size="sm">
            {{ t('onboarding.subscription.currentPlan') }}
          </UBadge>
        </div>

        <p class="mt-2 text-2xl font-bold tracking-tight" :data-plan-price="key">{{ planPrice(key) }}</p>
        <p class="text-xs text-muted">
          {{ yearly ? t('onboarding.subscription.perMonthYearly') : t('onboarding.subscription.perMonth') }}
        </p>
        <!-- PAngV: Endpreis-Hinweis AM Preis — nur bei Plänen, die etwas kosten. -->
        <p v-if="key !== 'basic'" class="mt-1 text-xs font-medium text-toned">
          {{ t('onboarding.subscription.vatNote') }}
        </p>

        <ul class="mt-4 flex-1 space-y-2 text-sm">
          <li v-for="i in PLAN_BULLETS[key]" :key="i" class="flex items-start gap-2">
            <UIcon name="i-ph-check" class="mt-0.5 size-4 shrink-0 text-success" />
            <span>{{ t(`onboarding.subscription.plans.${key}.bullets.${i - 1}`) }}</span>
          </li>
        </ul>

        <div class="mt-5">
          <UButton
            v-if="key !== 'basic' && !isCurrent(key)"
            block
            :loading="busy === key"
            :disabled="busy !== '' && busy !== key"
            :data-plan-cta="key"
            @click="buy(key)"
          >
            {{ t('onboarding.subscription.buy', { plan: t(`onboarding.subscription.plans.${key}.name`) }) }}
          </UButton>
          <p v-else class="text-xs text-muted">
            {{ isCurrent(key) ? t('onboarding.subscription.currentPlanNote') : t('onboarding.subscription.downgradeHint') }}
          </p>
        </div>
      </div>
    </div>
  </UPageCard>

  <UPageCard
    v-if="isTenantHost"
    :title="t('onboarding.subscription.portalTitle')"
    :description="t('onboarding.subscription.portalHint')"
    variant="subtle"
  >
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-receipt" class="mt-0.5 size-5 shrink-0 text-muted" />
        <p class="text-sm text-muted">{{ t('onboarding.subscription.portalNote') }}</p>
      </div>
      <UButton
        color="neutral"
        variant="subtle"
        icon="i-ph-arrow-square-out"
        :loading="busy === 'portal'"
        :disabled="busy !== '' && busy !== 'portal'"
        data-subscription-portal
        @click="openPortal"
      >
        {{ t('onboarding.subscription.portal') }}
      </UButton>
    </div>
  </UPageCard>
</template>

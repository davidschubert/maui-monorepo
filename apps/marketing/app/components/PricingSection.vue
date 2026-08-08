<script setup lang="ts">
// Szene 11 — die Schwelle (§6.4): schmerzlos, 14 Tage kostenlos. P4-Pricing
// (Davids Entscheid 2026-07-26): Personal 29 € / Pro 149 € / Enterprise
// individuell (Pukalani Studio), jährlich −25 %. Die Zahlen sind ECHT
// (Stripe-Katalog, ensure-prices) — der frühere Platzhalter-Zustand
// („Zahlen folgen") ist damit Geschichte. Ton: warmes Morgenlicht (dawn).
//
// KEINE BASIC-SPALTE MEHR (F49, Davids Entscheidung vom 2026-08-07): ohne Abo
// ist eine Community nach der Testphase nur-lesend — ein „für immer kostenlos"
// als dritte Preisspalte wäre damit schlicht falsch. Das kostenlose MITMACHEN
// (Konto anlegen, kommentieren, beitreten, melden) bleibt bestehen, ist aber
// kein Paket und gehört deshalb in die FAQ, nicht in diese Tabelle.
//
// Bauteile: `UTabs` (Intervall) + `UPricingPlans`/`UPricingPlan` (Karten).
// Die Optik der Karte steht als `pricingPlan`-Vertrag in app/app.config.ts.
const { t, n } = useI18n()
const { signIn } = useProductLinks()

// Der Umschalter führt den Zustand als Wert, nicht als Schalter: `UTabs`
// arbeitet mit dem Wert des gewählten Reiters (String|Number), und das Rechnen
// unten braucht ohnehin nur „ist es das Jahr?".
const interval = ref<string | number>('monthly')
const yearly = computed(() => interval.value === 'yearly')

const intervalItems = computed(() => [
  { value: 'monthly', label: t('marketing.pricing.monthly') },
  { value: 'yearly', label: t('marketing.pricing.yearly') },
])

// Die Pillen-Variante malt die aktive Fläche auf ZWEI Wegen: nach der
// Hydration über das geschobene Indicator-Element, DAVOR über ein ::before am
// aktiven Reiter — der Indicator misst seine Breite im Browser und wird auf dem
// Server gar nicht gerendert. Die drei letzten Zeilen ziehen deshalb dieselbe
// Optik auf den Ersatzweg. Ohne sie zeigt der erste Bildaufbau eine VOLL
// orange Pille mit eckigeren Ecken und springt bei der Hydration auf die
// 25-%-Tönung um (live nachgestellt: Client-Bündel blockiert, siehe
// scratchpad/shots/p4-nachher-toggle-ssr.png).
// Das lange `in-[…]`-Präfix ist NICHT schmückend: es ist genau die Bedingung
// der Vorgabe („in einer Liste ohne Indicator"). Nur mit derselben
// Bedingungskette erkennt tailwind-merge die Dopplung und wirft die
// Vorgabe-Klasse raus; eine kürzer geschriebene Regel stünde daneben und die
// Reihenfolge entschiede. Jede Klasse steht bewusst AUSGESCHRIEBEN da —
// zusammengesetzte Strings findet Tailwinds Scanner nicht.
const TRIGGER_CLASS = [
  'rounded-full px-4 py-[0.4rem] text-[0.9rem] font-bold',
  'data-[state=inactive]:text-toned data-[state=active]:text-highlighted',
  'in-[[data-slot=list]:not(:has([data-slot=indicator]))]:data-[state=active]:before:bg-primary/25',
  'in-[[data-slot=list]:not(:has([data-slot=indicator]))]:data-[state=active]:before:rounded-full',
  'in-[[data-slot=list]:not(:has([data-slot=indicator]))]:data-[state=active]:before:shadow-none',
].join(' ')

// Cent-Beträge = Stripe-Katalog (scripts/stripe/ensure-prices.mjs).
// yearlyMonthly = Jahrespreis / 12 (exakt −25 %), Anzeige pro Monat.
//
// BRUTTO (Davids Entscheid 2026-07-29, OPEN-ITEMS A3): die Beträge sind
// Endpreise inkl. 19 % MwSt. Das Publikum ist gemischt (Zielgruppenseite
// /use-cases/vereine — Vereine sind oft keine Unternehmer), und gegenüber
// Verbrauchern verlangt die PAngV den Gesamtpreis inklusive Umsatzsteuer.
// Der Hinweis steht deshalb AM Preis (vatNote), nicht im Fußzeilen-Kleingedruckten,
// und gilt für beide Intervalle (monatlich wie jährlich).
//
// UMGESETZT ALS `billingCycle`, NICHT ALS `terms`: `UPricingPlan` rendert
// `terms` in der FUSSZEILE UNTER dem Knopf (PricingPlan.vue, Zeile 138) — das
// wäre genau das Kleingedruckte, das die Pflichtangabe nicht sein darf.
// `billingCycle` ist die zweite Zeile im Preis-Block und steht damit direkt am
// Betrag. Die Gewichtung der beiden Zeilen dreht der `pricingPlan`-Vertrag.
const PRICES = { personal: { monthly: 2900, yearly: 26100 }, pro: { monthly: 14900, yearly: 134100 } } as const

function perMonth(key: keyof typeof PRICES): number {
  return yearly.value ? PRICES[key].yearly / 12 / 100 : PRICES[key].monthly / 100
}

const plans = computed(() => [
  { key: 'personal', price: n(perMonth('personal'), { style: 'currency', currency: 'EUR' }), note: yearly.value ? t('marketing.pricing.perMonthYearly') : t('marketing.pricing.perMonth'), vat: true, to: signIn, featured: true },
  { key: 'pro', price: n(perMonth('pro'), { style: 'currency', currency: 'EUR' }), note: yearly.value ? t('marketing.pricing.perMonthYearly') : t('marketing.pricing.perMonth'), vat: true, to: signIn, featured: false },
  { key: 'enterprise', price: t('marketing.pricing.enterprisePrice'), note: t('marketing.pricing.enterpriseNote'), vat: false, to: signIn, featured: false },
].map(plan => ({
  key: plan.key,
  price: plan.price,
  billingPeriod: plan.note,
  billingCycle: plan.vat ? t('marketing.pricing.vatNote') : undefined,
  highlight: plan.featured,
  title: t(`marketing.pricing.plans.${plan.key}.name`),
  tag: t(`marketing.pricing.plans.${plan.key}.tag`),
  tagline: t(`marketing.pricing.plans.${plan.key}.desc`),
  button: {
    to: plan.to,
    label: t(`marketing.pricing.plans.${plan.key}.cta`),
    // Der hervorgehobene Knopf war bis Paket 4 `color="warning"` — die letzte
    // Stelle der Seite, die eine STATUSFARBE als Markenfarbe benutzte. Seit
    // Paket 1 ist die Marke `primary` (die puka-Palette).
    color: plan.featured ? ('primary' as const) : ('neutral' as const),
    variant: plan.featured ? ('solid' as const) : ('soft' as const),
    // `UPricingPlan` gibt seinem Knopf sonst `size: 'lg'`; der Bestand steht
    // auf der Standardgröße.
    size: 'md' as const,
  },
})))
</script>

<template>
  <section id="preise" class="mkt-section tone-dawn-hold">
    <!--
      Der Sektionskopf bleibt handgeschrieben: `.mkt-kicker`/`.mkt-h2`/
      `.mkt-lead` sind der geteilte Rhythmus von zehn Sektionen dieser Seite
      (Paket 3 hat nur die HEROS und die SCHLUSSBLÖCKE zu Bausteinen gemacht).
      Zwei von zehn Köpfen auf `UPageSection` umzustellen, hieße den Rhythmus
      zu spalten — das ist ein eigenes Paket, kein Nebenprodukt.
    -->
    <div class="mkt-inner mkt-narrow pricing-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.pricing.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.pricing.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.pricing.lead') }}</p>

      <!--
        INTERVALL-UMSCHALTER — `UTabs` (Pillen-Variante), nicht `USwitch`.
        Der Bestand ist eine Pille mit ZWEI beschrifteten Hälften; ein Schalter
        hat nur einen Zustand und einen Text, die zweite Beschriftung („Monatlich")
        müsste daneben von Hand gebaut werden — der Eigenbau käme durch die
        Hintertür zurück.
        A11Y: die zwei <button> des Bestands sagten NICHT, welcher gewählt ist
        (kein aria-pressed, kein aria-current). `UTabs` liefert role="tab" +
        aria-selected und die Pfeiltasten-Navigation der Reka-Tabs. `:content="false"`
        heißt zugleich, dass KEIN Reiter-Inhalt registriert wird — und weil
        Reka `aria-controls` nur setzt, wenn es einen Inhalt gibt
        (TabsTrigger.vue: `contentIds.has(value) ? … : undefined`), bleibt kein
        Verweis ins Leere zurück. Der Rest der Ansage bleibt wie gehabt:
        `role="group"` + Beschriftung liegen auf der Wurzel, damit die Gruppe
        beim Betreten benannt wird.
      -->
      <UTabs
        v-model="interval"
        role="group"
        :aria-label="t('marketing.pricing.intervalLabel')"
        :items="intervalItems"
        :content="false"
        :ui="{
          root: 'inline-flex mt-4',
          list: 'gap-1 rounded-full border border-[color:var(--puka-pill-edge)] bg-(--puka-panel-bg) p-1',
          indicator: 'rounded-full bg-primary/25 shadow-none',
          trigger: TRIGGER_CLASS,
        }"
      >
        <template #default="{ item }">
          {{ item.label }} <span v-if="item.value === 'yearly'" class="text-primary-600">−25 %</span>
        </template>
      </UTabs>
    </div>

    <!-- `mkt-inner` (Breiten-Container) und das Raster sind BEWUSST zwei
         Elemente — gleiche Falle wie bei den Karten-Rastern aus Paket 2:
         `.mkt-inner` setzt in marketing.css `margin: 0 auto` als Kurzform, und
         diese ungeschichtete Regel schlägt jede Tailwind-Utility aus @layer;
         ein `mt-10` an derselben Stelle wäre wirkungslos (live gemessen: der
         Abstand von 40px fehlte ersatzlos).

         Das Raster selbst bleibt hier und nicht im app.config-Vertrag: die
         Spaltenzahl ist Layout DIESER Sektion (gleiche Trennung wie beim
         `pageGrid`-Vertrag). Die Vorgabe von `UPricingPlans` schaltet erst ab
         1024px um; der Bestand tut es ab 980px — deshalb die ausgeschriebene
         Stufe. Seit F49 sind es DREI Karten (Basic ist raus), nicht vier.

         Die zweispaltige Stufe braucht eine OBERE Schranke (`max-[979px]`) und
         nicht nur `sm:`: zwei Stufen mit VERSCHIEDENEN Bedingungen überleben
         tailwind-merge beide, und welche gewinnt, entscheidet dann die
         Reihenfolge in Tailwinds Ausgabe — dort steht `min-[980px]` VOR `sm:`.
         Live gemessen: bei 1000px standen zwei Karten statt vier. Mit dem
         Bereich 640–979px überschneiden sich die Stufen gar nicht mehr. -->
    <div class="mkt-inner" data-reveal>
      <UPricingPlans class="mt-10 grid grid-cols-1 gap-5 sm:max-[979px]:grid-cols-2 min-[980px]:grid-cols-3">
        <UPricingPlan
          v-for="plan in plans" :key="plan.key"
          :title="plan.title"
          :price="plan.price"
          :billing-period="plan.billingPeriod"
          :billing-cycle="plan.billingCycle"
          :tagline="plan.tagline"
          :button="plan.button"
          :highlight="plan.highlight"
        >
          <template #header>{{ plan.tag }}</template>
        </UPricingPlan>
      </UPricingPlans>
    </div>
  </section>
</template>

<style scoped>
/* Geblieben ist nur der Sektionskopf; Pille, Raster und Karte sind Bausteine
   (siehe `pricingPlan` in app/app.config.ts). */
.pricing-head { text-align: center; }
.pricing-head .mkt-lead { margin-inline: auto; }
</style>

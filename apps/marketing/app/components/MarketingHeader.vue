<script setup lang="ts">
/**
 * Kopfbereich der Marketing-Seite — `UHeader` + `UNavigationMenu` (Paket 5).
 *
 * DAVIDS ENTSCHEIDUNG 2026-07-31: die GANZE Landingpage läuft auf Nuxt UI, und
 * das schlägt „kein JS". Bis Paket 4 waren der Produkte-Ausklapper (`:hover` /
 * `:focus-within`) und das Mobil-Menü (`<details>`) bewusst ohne JavaScript
 * gebaut, damit sie schon VOR der Hydration funktionieren. Beide sind jetzt
 * Reka-Bausteine und brauchen den hydrierten Client. Was die Seite dafür
 * bekommt: echte Menü-Semantik (role/aria-expanded, Pfeiltasten, Escape,
 * Fokus-Rückgabe) statt eines Ausklappers, den ein Screenreader als
 * Verschachtelung von Links liest — und EIN Vokabular für die ganze Seite.
 */
import { type ProductKey, slugForLocale } from '#shared/marketing'

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { start } = useProductLinks()

// Die Produkte der Hauptnavigation, am KANONISCHEN Schlüssel. Reihenfolge
// = Reihenfolge im Bausteine-Abschnitt; Texte kommen aus i18n
// (marketing.nav.products.items.<key>), nur Icon und Early-Access-Flagge stehen
// im Code. Der Slug in der Adresse ist übersetzt und kommt aus
// shared/marketing.ts — NIE aus dem Schlüssel hier.
const PRODUCTS = [
  { key: 'diskussionen', icon: 'i-ph-chats-circle-bold', ea: false },
  { key: 'moderation', icon: 'i-ph-shield-check-bold', ea: false },
  { key: 'branding', icon: 'i-ph-note-bold', ea: false },
  { key: 'beitraege', icon: 'i-ph-broadcast-bold', ea: true },
  { key: 'kurse', icon: 'i-ph-graduation-cap-bold', ea: true },
  { key: 'events', icon: 'i-ph-calendar-check-bold', ea: true },
  // Analytics ist GEBAUT und im Angebot (ab Personal) — also keine
  // Early-Access-Pille: die kennzeichnet nur, was noch nicht käuflich ist
  // (§2.4). Dass es einen Plan voraussetzt, sagt die Preistabelle.
  { key: 'analytics', icon: 'i-ph-chart-line-up-bold', ea: false },
] as const satisfies readonly { key: ProductKey, icon: string, ea: boolean }[]

/**
 * Alle Anker-Ziele der Navigation liegen auf der STARTSEITE — der Header hängt
 * über layouts/site.vue aber an jeder Seite. Ein rohes href="#preise" zeigt auf
 * /faq oder /produkte/* deshalb ins Leere; als { path, hash } navigiert der Link
 * erst nach Hause und springt dort zum Abschnitt. localePath, damit der
 * Locale-Präfix (/de/…) nicht verloren geht.
 */
function homeSection(hash: string) {
  return computed(() => ({ path: localePath('/'), hash }))
}
const blocksTarget = homeSection('#bausteine')
const pricingTarget = homeSection('#preise')
const storyTarget = homeSection('#geschichte')

/**
 * Ziel einer Produkt-Seite. ZWEI Übersetzungen stecken darin, und beide sind
 * Pflicht: `localePath` setzt das Segment (`/produkte` ↔ `/products`),
 * `slugForLocale` den Slug (`kurse` ↔ `courses`). Ohne die zweite stünde auf
 * der englischen Seite `/products/kurse` — seit 2026-07-31 eine 301.
 * Bewusst nicht memoisiert: der Aufruf steht in `computed`s, die ohnehin an
 * `locale` hängen.
 */
function productTo(key: ProductKey) {
  return localePath({ name: 'produkte-slug', params: { slug: slugForLocale(key, locale.value) } })
}

/**
 * ZWEI EIGENSCHAFTEN AN JEDEM NAVIGATIONS-EINTRAG, beide bewusst:
 *
 * `active: false` — `ULink` färbt einen Eintrag ein, sobald der PFAD zutrifft.
 * Die drei Anker-Ziele zeigen alle auf `/de`, also wären auf der Startseite
 * ALLE DREI gleichzeitig „aktiv" (orange). Das ist keine Auszeichnung mehr,
 * sondern Rauschen — der Bestand hat nie einen aktiven Zustand gezeigt.
 * `isLinkActive()` liest die Eigenschaft VOR jeder eigenen Rechnung.
 *
 * `locale: false` — `ULink` schiebt einen String-Pfad noch einmal durch
 * `localePath()`. Diese App löst ihre Links grundsätzlich über den Route-NAMEN
 * auf (Regel in MarketingFooter.vue), das Ergebnis ist also schon der fertige
 * Pfad. Ein zweiter Durchlauf wäre bestenfalls wirkungslos und schlimmstenfalls
 * eine zweite Auflösung derselben URL auf einer Sprache, die andere Segmente
 * benutzt (/produkte ↔ /products).
 */
const LINK_DEFAULTS = { active: false, locale: false } as const

const desktopItems = computed(() => [
  // Kein `children`: der Ausklapper wird über den `#products-content`-Slot
  // gefüllt (siehe Begründung dort). `UNavigationMenu` macht aus dem Eintrag
  // auch so einen Auslöser — die Bedingung im Bauteil ist „children ODER
  // Content-Slot". `to` fehlt deshalb bewusst: ein Auslöser mit Untermenü ist
  // kein Link mehr, den Weg zur Übersicht übernimmt der Fuß des Ausklappers.
  // `marketing.nav.products.label`, NICHT `marketing.nav.products`: der flache
  // Schlüssel stand in de.json/en.json ein zweites Mal ALS OBJEKT (mit
  // `overview` + `items`), und JSON.parse behält bei doppelten Schlüsseln den
  // LETZTEN. Der Auslöser der Hauptnavigation zeigte deshalb live die
  // Zeichenkette „marketing.nav.products" statt „Produkte"/„Products" (nur eine
  // intlify-WARNUNG in der Konsole, kein Fehler — deshalb monatelang unbemerkt).
  { label: t('marketing.nav.products.label'), value: 'products', slot: 'products' as const },
  { ...LINK_DEFAULTS, label: t('marketing.nav.pricing'), to: pricingTarget.value },
  { ...LINK_DEFAULTS, label: t('marketing.nav.story'), to: storyTarget.value },
])

// Zwei Listen = ein Trenner dazwischen (`UNavigationMenu` rendert ihn
// zwischen Listen selbst) — der Bestand zog dieselbe Linie zwischen den
// Produkten und den Seiten-Ankern.
const mobileItems = computed(() => [
  PRODUCTS.map(product => ({
    ...LINK_DEFAULTS,
    label: t(`marketing.nav.products.items.${product.key}.title`),
    icon: product.icon,
    to: productTo(product.key),
  })),
  [
    { ...LINK_DEFAULTS, label: t('marketing.nav.products.label'), to: blocksTarget.value },
    { ...LINK_DEFAULTS, label: t('marketing.nav.pricing'), to: pricingTarget.value },
    { ...LINK_DEFAULTS, label: t('marketing.nav.story'), to: storyTarget.value },
    // FAQ hat eine EIGENE Seite (mit eigenem JSON-LD/OG) — die gewinnt gegen
    // den Anker auf der Startseite, so wie im Footer.
    { ...LINK_DEFAULTS, label: t('marketing.faq.kicker'), to: localePath({ name: 'faq' }) },
  ],
])

/**
 * Der offene Ausklapper wird GEFÜHRT, nicht nur beobachtet: die Links im
 * `#products-content`-Slot sind gewöhnliche `NuxtLink` und kein
 * `NavigationMenuLink` (Reka ist aus dieser App nicht importierbar — `reka-ui`
 * ist eine Abhängigkeit von @nuxt/ui und liegt nicht im Auflösungspfad der
 * App). Ohne diesen Wert bliebe der Ausklapper nach einem Klick offen stehen,
 * weil Reka den Schluss nur für seine eigenen Links kennt.
 */
const openMenu = ref('')

/**
 * DER SPRACHWECHSLER STEHT NICHT MEHR HIER (Davids Entscheidung 2026-07-31):
 * er ist in den Fuß gewandert, unten rechts als Auswahlmenü mit Flagge
 * (MarketingFooter.vue — dort auch die Begründung des Hash-Strips). Der Kopf
 * trägt nur noch Navigation und den einen CTA: „Kostenlos starten" ist das
 * Ziel dieser Seite, und ein zweiter Knopf daneben nimmt ihm Aufmerksamkeit
 * für eine Entscheidung, die die meisten Besucher nie treffen.
 */

// Mobil-Menü: `UHeader` schließt es beim Routenwechsel selbst (`autoClose`).
const mobileOpen = ref(false)

const HEADER_UI = {
  // Der Bestand ist eine haltende Leiste, KEINE feste Höhe: auf 375px bricht
  // der CTA auf zwei Zeilen und die Leiste wächst mit (gemessen 69px statt
  // 53px). Die Vorgabe `h-(--ui-header-height)` schnitte ihn ab.
  root: [
    'h-auto min-h-(--ui-header-height)',
    'bg-(--puka-header-surface) border-[color:var(--puka-header-edge)]',
    'backdrop-blur-[10px] backdrop-saturate-[1.4]',
  ].join(' '),
  // 72rem inklusive der 1,5rem-Polsterung — so weit war `.mkt-header-inner`
  // (gemessen: 1152px Kasten, 1104px Inhalt). Der app.config-Vertrag setzt
  // 71rem für die SEKTIONEN; Kopf und Fuß standen im Bestand breiter.
  //
  // DIE SENKRECHTE LUFT WECHSELT DEN BESITZER, sobald das Menü sichtbar wird.
  // Ab 768px steckt sie schon im Menü-Eintrag (`item: py-2`) und gehört auch
  // DORTHIN: der Ausklapper hängt an der Unterkante des MENÜS, nicht an der
  // der Leiste — zöge man sie in den Container, klaffte dazwischen eine Lücke,
  // in der die Maus das Menü verlässt und der Ausklapper zufällt. Darunter
  // gibt es kein Menü, dort muss der Container polstern, sonst klebte der
  // zweizeilige CTA an beiden Kanten.
  // Gemessen: 53px ab 768px, 69px auf 375px — beides exakt der Bestand.
  container: 'max-w-[72rem] h-auto py-3 md:py-1 gap-6',
  // Die Vorgabe teilt Schreibtisch und Handy bei 1024px, der Bestand bei
  // 768px. Ohne diese vier Zeilen bekämen Tablets ab 768px plötzlich das
  // Burger-Menü statt der Navigation.
  left: 'md:flex-1',
  right: 'md:flex-1 gap-3',
  center: 'md:flex',
  toggle: 'md:hidden',
  content: 'md:hidden',
  overlay: 'md:hidden',
  title: 'items-center gap-2 text-[1.1rem] font-extrabold tracking-[-0.01em]',
}

/**
 * Der Umschalt-Knopf darf NICHT `ghost` sein: app.config.ts dreht `neutral` +
 * `ghost` seit Paket 3 auf `text-inverted` (weiß) — das ist der sekundäre CTA
 * auf den DUNKLEN Abschlussblöcken. Auf der hellen Kopfleiste wäre das ein
 * unsichtbares Zeichen. `link` trägt keine Farbe von dort und bekommt die
 * Hover-Fläche des Bestands (hsl(ink / 0.06) ≈ neutral-100) hier.
 *
 * DIE BESCHRIFTUNG MUSS HIER STEHEN, und sie muss BERECHNET sein.
 * `UHeader` setzt sie aus seiner EIGENEN Sprachdatei (`t('header.open')` aus
 * Nuxt UIs `useLocale()`) — auf der deutschen Seite stand deshalb „Open menu",
 * obwohl `marketing.nav.menu` seit jeher „Menü öffnen" sagt. Nuxt UIs Locale
 * hängt am `UApp`/`ui.locale`, nicht an @nuxtjs/i18n, und würde sich nur
 * app-weit umstellen lassen; die Seite hat den Text aber schon.
 * `v-bind` des `toggle`-Objekts steht im Bauteil NACH dem eigenen
 * `:aria-label`, überschreibt es also. Weil das Zeichen im offenen Zustand zum
 * Kreuz wird, wandert die Beschriftung mit: eine feste Zeichenkette hier
 * hieße, der Screenreader sagte am offenen Menü weiterhin „Menü öffnen".
 */
const TOGGLE_PROPS = computed(() => ({
  color: 'neutral' as const,
  variant: 'link' as const,
  'aria-label': mobileOpen.value ? t('marketing.nav.menuClose') : t('marketing.nav.menu'),
  class: 'size-[2.2rem] justify-center rounded-[0.55rem] p-0 text-highlighted hover:bg-elevated/70',
}))

const NAV_UI = {
  list: 'gap-1',
  // `.nav-link`: 0,95rem / 500 / --puka-ink-soft ≈ `text-toned` (in Paket 2
  // als Treffer belegt), Hover auf --puka-sun-deep = primary-600. `py-0.5`
  // hält die Zeile auf den 27px des Bestands — die Vorgabe `py-1.5` machte die
  // ganze Leiste 23px höher.
  link: 'px-2.5 py-0.5 text-[0.95rem] font-medium text-toned hover:text-primary-600',
  linkTrailingIcon: 'size-[0.8rem]',
  // DIE BREITE DES AUSKLAPPERS STEHT AN DER PLATTE, NICHT AM INHALT.
  // Reka misst den Inhalt und schreibt das Ergebnis nach
  // `--reka-navigation-menu-viewport-width` — der Inhalt sitzt aber ABSOLUT in
  // genau dieser Platte, die Messung ist also zirkulär: gemessen kam 276px
  // heraus (die Breite der Menüleiste), der 23rem breite Inhalt lief unter
  // `overflow-hidden` heraus und die Beschreibungen waren abgeschnitten.
  // Mit dem festen Maß HIER und `w-full` am Inhalt fällt die Messung weg.
  // `min-w` UND NICHT `w`: die Vorgabe setzt die Breite als
  // `sm:w-(--reka-navigation-menu-viewport-width)`, und diese v4-Kurzform
  // erkennt tailwind-merge nicht als Breiten-Utility — beide Klassen blieben
  // stehen und die Reihenfolge in Tailwinds Ausgabe entschiede (live gemessen:
  // die Vorgabe gewann, die Platte blieb 276px schmal). `min-w` liegt in einer
  // anderen Gruppe, kollidiert also gar nicht erst.
  // `mt-4` = die 6px unter dem Menü bis zur Leistenkante plus die 0,65rem
  // Abstand des Bestands. Der Abstand hängt am WRAPPER, nicht am Panel: so
  // bleibt die Maus auf dem Weg nach unten im Menü und der Ausklapper schließt
  // nicht (der Bestand löste das mit `padding-top` an derselben Stelle).
  viewport: [
    'min-w-[23rem] max-w-[calc(100vw-2rem)]',
    'mt-4 rounded-[0.9rem] bg-(--puka-solid-bg)',
    'ring-[color:var(--puka-menu-edge)]',
    'shadow-[0_18px_40px_-20px_var(--puka-menu-shadow)]',
  ].join(' '),
  content: 'w-full',
}

const MOBILE_NAV_UI = {
  link: 'px-3 py-2.5 text-[0.95rem] font-semibold text-highlighted hover:text-primary-600',
  linkLeadingIcon: 'size-[1.05rem] text-primary-600 group-hover:text-primary-600',
  separator: 'my-2 bg-[color:var(--puka-menu-edge)]',
}
</script>

<template>
  <UHeader
    v-model:open="mobileOpen"
    :to="localePath('/')"
    :toggle="TOGGLE_PROPS"
    :ui="HEADER_UI"
  >
    <template #title>
      <PukaMark :size="26" />
      <span>Pukalani</span>
    </template>

    <!-- Standard-Slot = die MITTE der Leiste (Schreibtisch-Navigation). -->
    <UNavigationMenu
      v-model="openMenu"
      :items="desktopItems"
      :aria-label="t('marketing.nav.aria.main')"
      variant="link"
      content-orientation="vertical"
      trailing-icon="i-ph-caret-down-bold"
      :unmount-on-hide="false"
      :ui="NAV_UI"
    >
      <!--
        DER AUSKLAPPER WIRD VON HAND GEFÜLLT — und zwar wegen der
        Early-Access-Pillen. `UNavigationMenu` kennt eine `badge`-Eigenschaft
        nur für die OBERSTE Ebene; ein Kind rendert genau Icon, Titel und
        Beschreibung und hat dafür auch keinen Label-Slot. Die Pille wäre also
        nicht darstellbar, und sie ist keine Zierde: sie ist das Claim-Gate
        (§2.4) — Feed, Kurse und Events dürfen nicht wie fertige Produkte
        aussehen.
        Die Klassen kommen aus dem Bauteil selbst (`ui.childLink()` & Co.),
        damit Hover, Fokus und Abstände dieselben bleiben wie bei einem
        Nuxt-UI-Kind.
      -->
      <template #products-content="{ ui }">
        <ul :class="ui.childList()">
          <li v-for="product in PRODUCTS" :key="product.key" :class="ui.childItem()">
            <NuxtLink
              :to="productTo(product.key)"
              :class="ui.childLink({ active: false, class: 'gap-3 rounded-[0.6rem]' })"
              @click="openMenu = ''"
            >
              <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary-600">
                <UIcon :name="product.icon" class="size-[1.1rem]" />
              </span>
              <span :class="ui.childLinkWrapper()">
                <span :class="ui.childLinkLabel({ active: false, class: 'flex items-center gap-1.5 whitespace-normal font-bold text-[0.92rem] text-highlighted' })">
                  {{ t(`marketing.nav.products.items.${product.key}.title`) }}
                  <UBadge
                    v-if="product.ea"
                    color="primary" variant="subtle" size="sm"
                    class="rounded-[0.35rem] px-1.5 py-0 text-[0.62rem] font-extrabold uppercase tracking-[0.03em]"
                    :label="t('marketing.blocks.earlyAccess')"
                  />
                </span>
                <span :class="ui.childLinkDescription({ active: false, class: 'block text-[0.8rem]/[1.4] text-toned' })">
                  {{ t(`marketing.nav.products.items.${product.key}.text`) }}
                </span>
              </span>
            </NuxtLink>
          </li>
          <li>
            <NuxtLink
              :to="blocksTarget"
              class="mt-1 flex items-center gap-1.5 border-t border-[color:var(--puka-menu-edge)] px-3 pb-1.5 pt-2.5 text-[0.85rem] font-bold text-primary-600 hover:underline"
              @click="openMenu = ''"
            >
              {{ t('marketing.nav.products.overview') }}
              <UIcon name="i-ph-arrow-right-bold" class="size-[0.85rem]" aria-hidden="true" />
            </NuxtLink>
          </li>
        </ul>
      </template>
    </UNavigationMenu>

    <template #right>
      <UButton :to="start" color="primary" size="sm">
        {{ t('marketing.nav.start') }}
      </UButton>
    </template>

    <!-- Mobil: dieselben Ziele wie der <details>-Ausklapper des Bestands, in
         derselben Reihenfolge — sechs Produkte, Trenner, dann die vier
         Seiten-Anker. Ausgeklappt wird bewusst nichts: die Produkte sind hier
         flache Links, kein zweites Menü im Menü. -->
    <template #body>
      <UNavigationMenu
        :items="mobileItems"
        :aria-label="t('marketing.nav.aria.main')"
        orientation="vertical"
        variant="link"
        :ui="MOBILE_NAV_UI"
      />
    </template>
  </UHeader>
</template>
